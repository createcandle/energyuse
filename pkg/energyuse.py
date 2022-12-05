"""Energy use adapter for Candle Controller."""

import os
import re
import sys
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
import json
import time
import datetime
import requests  # noqa
import threading
import subprocess

from gateway_addon import Database, Adapter, Device, Property

try:
    #from gateway_addon import APIHandler, APIResponse
    from .energyuse_api_handler import *
    
except Exception as ex:
    print("Unable to load APIHandler (which is used for UI extention): " + str(ex))

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))

_TIMEOUT = 3

_CONFIG_PATHS = [
    os.path.join(os.path.expanduser('~'), '.webthings', 'config'),
]

if 'WEBTHINGS_HOME' in os.environ:
    _CONFIG_PATHS.insert(0, os.path.join(os.environ['WEBTHINGS_HOME'], 'config'))



class EnergyUseAdapter(Adapter):
    """Adapter for Energy Use"""

    def __init__(self, verbose=False):
        """
        Initialize the object.

        verbose -- whether or not to enable verbose logging
        """

        #print("initialising adapter from class")
        self.pairing = False
        self.addon_name = 'energyuse'
        self.DEBUG = False
        self.name = self.__class__.__name__
        Adapter.__init__(self, self.addon_name, self.addon_name, verbose=verbose)

        self.api_server = 'http://127.0.0.1:8080'

        # Setup persistence
        #for path in _CONFIG_PATHS:
        #    if os.path.isdir(path):
        #        self.persistence_file_path = os.path.join(
        #            path,
        #            'energyuse-persistence.json'
        #        )
        #        print("self.persistence_file_path is now: " + str(self.persistence_file_path))

        self.addon_path = os.path.join(self.user_profile['addonsDir'], self.addon_name)
        #self.persistence_file_path = os.path.join(os.path.expanduser('~'), '.mozilla-iot', 'data', self.addon_name,'persistence.json')
        
        self.addon_data_dir = os.path.join(self.user_profile['dataDir'], self.addon_name)
        if not os.path.isdir(self.addon_data_dir):
            os.mkdir(self.addon_data_dir)
        
        self.persistence_file_path = os.path.join(self.user_profile['dataDir'], self.addon_name, 'persistence.json')

        self.running = True
        self.things = None
        self.got_fresh_things_list = False
        
        self.addon_start_time = datetime.datetime.now()
        self.last_kwh_measurement_time = None
        self.previous_hour = self.addon_start_time.hour # used to remember the current hour. Will immediately be replaced by hour from persistent data if available.
        #print("initial self.previous_hour (which is acually the current hour): " + str(self.previous_hour))
        #self.test_counter = 0
        
        self.previous_hour_day_delta = None # used to remember what the day_delta value was an hour ago, in order to figure out how much was used in the last hour.. 
        self.previous_hour_total = None # used to remember the total Kwh the devices are reporting. This is not per-day data.

        self.real_total_power = None
        self.virtual_total_power = None
        self.total_power = None
        self.total_power_interval = 10
        self.update_simple_things_countdown = 10
        self.update_simple_things_running = False
        
        # Get persistent data
        try:
            with open(self.persistence_file_path) as f:
                self.persistent_data = json.load(f)
                if self.DEBUG:
                    print('self.persistent_data loaded from file: ' + str(self.persistent_data)) # print never gets called, debug is still false
                
        except Exception as ex:
            print("ERROR: Could not load persistent data (if you just installed the add-on then this is normal): " + str(ex))
            self.persistent_data = {'energy':{}, 'api_server':'http://127.0.0.1:8080','token':None, 'device_detail_days':14, 'data_retention_months':24}

        #print("--.--")
        #print('self.persistent_data: ' + str(self.persistent_data))

        # LOAD CONFIG
        try:
            self.add_from_config()

        except Exception as ex:
            print("Error loading config: " + str(ex))


        if not 'previous_hour_day_delta' in self.persistent_data:
            self.persistent_data['previous_hour_day_delta'] = None
            
        if not 'kwh_price' in self.persistent_data:
            self.persistent_data['kwh_price'] = None
        
        if not 'hide_cost' in self.persistent_data:
            self.persistent_data['hide_cost'] = False

        if not 'virtual' in self.persistent_data:
            self.persistent_data['virtual'] = {}
        

        if 'previous_hour' in self.persistent_data:
            #print("setting previous_hour from persistent data: " + str(self.persistent_data['previous_hour'])) # TODO: do this using the last timestamp instead, to be very sure that the addon was restarted quickly, and not hours or days later.
            self.previous_hour = self.persistent_data['previous_hour']

        self.prune_data()
        
        #if self.DEBUG:
        #    self.previous_hour -= 1 
        
        try:
            if self.DEBUG:
                print("starting api handler")
            self.api_handler = EnergyUseAPIHandler(self, verbose=True)
            #self.manager_proxy.add_api_handler(self.extension)
            if self.DEBUG:
                print("Extension API handler initiated")
        except Exception as e:
            if self.DEBUG:
                print("Failed to start API handler (this only works on gateway version 0.10 or higher). Error: " + str(e))

        # Create the energy use device
        try:
            energyuse_device = EnergyUseDevice(self)
            self.handle_device_added(energyuse_device)
            if self.DEBUG:
                print("energyuse_device created")
            self.devices['energyuse'].connected = True
            self.devices['energyuse'].connected_notify(True)

        except Exception as ex:
            print("Could not create energyuse_device: " + str(ex))
        
        #if not self.DEBUG:
        #    time.sleep(4)

        # Start the internal clock
        if self.DEBUG:
            print("Starting the internal clock")
        try:            
            if self.persistent_data['token'] != None:
                t = threading.Thread(target=self.clock)
                t.daemon = True
                t.start()
        except Exception as ex:
            print("Error starting the clock thread: " + str(ex))

        self.ready = True
        self.save_persistent_data()

        self.get_power_data()

        """
        print("HIERO", self.DEBUG)
        # Add virtual devices energy use
        print("self.persistent_data['virtual']: " , str(self.persistent_data['virtual']))
        virtual_device_exists = False
        for virtual in self.persistent_data['virtual']:
            try:      
                if self.DEBUG:
                    print("\nlooping over virtual device: " + str(virtual))
                    print("virtual: " + str(self.persistent_data['virtual'][virtual]))
                if 'deleted_time' in self.persistent_data['virtual'][virtual]:
                    if self.DEBUG:
                        print("skipping deleted virtual device: " + str(self.persistent_data['virtual'][virtual]))
                elif 'created_time' in self.persistent_data['virtual'][virtual] and 'kwh' in self.persistent_data['virtual'][virtual]:
                    print("yes, it exists")
                    if self.persistent_data['virtual'][virtual]['created_time'] < (time.time() - 600): # should be at least five minutes old, to avoid counting devices that are eroneous.
                        device_delta = current_hour * ( float(self.persistent_data['virtual'][virtual]['kwh']) / 24 )
                        if self.DEBUG:
                            print("adding virtual device use kWH: " + str(self.persistent_data['virtual'][virtual]['kwh']) + ", with used so far today: " + str(device_delta))
                        #day_delta = day_delta + device_delta
        
                        virtual_device_exists = True
                else:
                    if self.DEBUG:
                        print("Virtual data was (partially) missing?: " + str(self.persistent_data['virtual'][virtual]))
            except Exception as ex:
                print("Error doing test loop: " + str(ex))
                
            print("odd")
        """

    def add_from_config(self):
        """Attempt to add all configured devices."""
        try:
            database = Database(self.addon_name)
            if not database.open():
                print("Error. Could not open settings database")
                self.close_proxy()
                return

            config = database.load_config()
            database.close()

        except:
            print("Error. Failed to open settings database.")
            self.close_proxy()
            return
            
        if not config:
            self.close_proxy()
            return


        # Api token
        try:
            if 'Authorization token' in config:
                if len(config['Authorization token']) > 10:
                    self.persistent_data['token'] = str(config['Authorization token'])
                    if self.DEBUG:
                        print("-Authorization token was present in the config data.")
        except Exception as ex:
            print("Error loading authorization key from settings: " + str(ex))
        
        
        try:
            if 'Device detail days' in config:
                self.persistent_data['device_detail_days'] = int(config['Device detail days'])
                if self.DEBUG:
                    print("Device detail days preference was in config. It's now: " + str(self.persistent_data['device_detail_days']))
        except Exception as ex:
            print("Error loading device detail days from settings: " + str(ex))
        
        
        try:
            if 'Data retention months' in config:
                self.persistent_data['data_retention_months'] = int(config['Data retention months'])
                if self.DEBUG:
                    print("Data retention months preference was in config. It's now: " + str(self.persistent_data['data_retention_months']))
        except Exception as ex:
            print("Error loading data retention from settings: " + str(ex))

        if 'Hide cost' in config:
            #print("-Debugging was in config")
            self.persistent_data['hide_cost'] = bool(config['Hide cost'])
            if self.DEBUG:
                print("Hide cost preference was in config. It's now: " + str(self.persistent_data['hide_cost']))

        if 'Debugging' in config:
            #print("-Debugging was in config")
            self.DEBUG = bool(config['Debugging'])
            if self.DEBUG:
                print("Debugging enabled")

        if self.DEBUG:
            print(str(config))

        





#
#  CLOCK
#

    def clock(self):
        """ Handles the various timers """
        
        if self.DEBUG:
            print("CLOCK INIT.. ")
        time.sleep(2)
        #time.sleep(initial_sleep)
        busy_counting = False
        clock_active = True
        while clock_active and self.running: # and self.player != None
            try:
                
                # using now() to get current time 
                date_object = datetime.datetime.now() 
    
                if not 'last_day' in self.persistent_data:
                    self.persistent_data['last_day'] = date_object.day
                    self.save_persistent_data()
                    if self.DEBUG:
                        print('last_day  was not in persistent data yet. Added it now: ' + str(self.persistent_data['last_day']))
                #else:
                #    if self.DEBUG:
                #        print('previous day in persistent data: ' + str(self.persistent_data['last_day']))
                #
                #if self.DEBUG:
                #    print ("today is: " + str(date_object.day))
                
                
             
            
                #
                # A new day
                #
                
                #test = True
                
                if busy_counting == True:
                    if self.DEBUG:
                        print("already busy counting energy, aborting superflous call")
                    return
                
                if date_object.day != self.persistent_data['last_day'] and date_object.hour == 0: # or self.test_counter == 3:
                    #self.test_counter = 0
                    
                    if self.DEBUG:
                        print("\nIT'S A NEW DAY!")
                        print("- date_object.day: " + str(date_object.day))
                        print("- date_object.hour: " + str(date_object.hour))
                        print("- self.persistent_data['last_day']: " + str(self.persistent_data['last_day']))
                    busy_counting = True
                    try:
                        # get fresh things data. Trying 6 times.
                        self.got_fresh_things_list = False
                        for x in range(6):
                            #print("in for loop to get fresh things")
                            self.update_simple_things()
                            if self.got_fresh_things_list:
                                if self.DEBUG:
                                    print("Got fresh things data")
                                break
                            else:
                                time.sleep(10)
            
                        if self.got_fresh_things_list:
                            self.persistent_data['last_day'] = date_object.day
                            self.previous_hour = date_object.hour # avoid also running the "new hour" loop a few seconds after this one
                            self.get_energy_data(True)
                        
                    except Exception as ex:
                        print("clock: error: " + str(ex))
                        
                    self.save_persistent_data()
                    
                elif date_object.hour != self.previous_hour: # or test == True: # or self.test_counter < 3:
                    if self.DEBUG:
                        print("IT'S A NEW HOUR. Current hour: " + str(date_object.hour) + ", and previous hour: " + str(self.previous_hour))
                    self.previous_hour = date_object.hour
                    
                    busy_counting = True
                    # get fresh things data
                    self.got_fresh_things_list = False
                    for x in range(6):
                        #print("in for loop to get fresh things")
                        self.update_simple_things()
                        if self.got_fresh_things_list:
                            if self.DEBUG:
                                print("Got fresh things data")
                            break
                        else:
                            time.sleep(10)
                    
                    if self.got_fresh_things_list:
                        
                        #print("not a new day, but a new hour")
                        self.get_energy_data(False) # only updates the 'energy use so far today'
                        self.previous_hour = date_object.hour
                    
                time.sleep(60)
                #busy_counting = False
                #self.test_counter += 1
                #if self.test_counter > 3:
                #    self.test_counter = 0
                #
                # Now that we're sure we're in the next day, go to sleep again.
                #
            except Exception as ex:
                print("clock error: " + str(ex))
            
            busy_counting = False
            
            
        if self.DEBUG:
            print("CLOCK THREAD EXIT")



    #
    #  POWER
    #

    # This method loops forever
    def get_power_data(self):
        if self.DEBUG:
            print("in get_power_data")
            
        self.last_power_data_timestamp = time.time()
    
        while self.running:
                
            time.sleep(1)
            
            if self.update_simple_things_countdown > 0:
                if self.DEBUG:
                    print("self.update_simple_things_countdown: " + str(self.update_simple_things_countdown))
                if self.update_simple_things_countdown == 1:
                    self.update_simple_things()
                self.update_simple_things_countdown -= 1
                
            if time.time() > self.last_power_data_timestamp + self.total_power_interval:
                self.last_power_data_timestamp = time.time()
                if self.DEBUG:
                    print("get_power_data: interval passed, attempting new run")
                
                try:
                    if self.things == None:
                        if self.DEBUG:
                            print("Error: get_energy_data: no valid things data. Stopping this run and getting that data instead.")
                        self.update_simple_things()
                        
                    else:
                        
                        total_power = 0 # real + virtual
                        
                        real_total_power = 0
                        device_count = 0
                        api_error_count = 0
        
                        for thing in self.things:
                            #print('looping over thing: ', thing)
                            #print( str(thing['@type']) )
                
                            # Stop if the addon is being stopped
                            if self.running == False:
                                break
                
                            if '@type' in thing:
                            #if hasattr(thing, '@type'):
                                #print('looping over thing. @type: ' + str(thing['@type']))
        
                                if 'EnergyMonitor' in thing['@type']:
                                    thing_id = str(thing['id'].rsplit('/', 1)[-1])
                                    if self.DEBUG:
                                        print("\nenergy monitor device spotted: " + str(thing_id) )
                                    #print("thing = "  + str(thing))
                                    #print("thing_id = "  + str(thing_id))
                                    #new_simple_things[thing_id] = []
                                    #if self.DEBUG:
                                    #    print("thing['properties']: " + str(thing['properties']))
                                    if 'properties' in thing:
                                        if self.DEBUG:
                                            print("-properties was in thing")
                                            #print(thing['properties'])
                                            #print(json.dumps(thing['properties'], indent=4))
                    
                                        power_property_found = False
                    
                                        for proppy in thing['properties']:
                                            #if self.DEBUG:
                                            #    print("proppy: " + str(proppy))
                        
                                            if 'title' in thing['properties'][proppy]:
                                                if thing['properties'][proppy]['title'].lower() == 'power':
                                                    power_property_found = True
                                                    try:
                                                        thing_property_key = proppy #'power'
                                                        if self.DEBUG:
                                                            print("--power property: ", thing['properties'][thing_property_key])
                            
                                                        device_count += 1
                                                        property_href = ""
                                    
                                                        try:
                                                            if 'forms' in thing['properties'][thing_property_key]:
                                                                if len(thing['properties'][thing_property_key]['forms']) > 0:
                                                                    #if self.DEBUG:
                                                                    #    print("forms")
                                                                    property_href = thing['properties'][thing_property_key]['forms'][0]['href']
                                
                                                            if property_href == "":
                                                                if 'links' in thing['properties'][thing_property_key]:
                                                                    if len(thing['properties'][thing_property_key]['links']) > 0:
                                                                        #if self.DEBUG:
                                                                        #    print("links")
                                                                        property_href = thing['properties'][thing_property_key]['links'][0]['href']

                                                            if property_href == "":
                                                                if self.DEBUG:
                                                                    print("Error, neither links nor forms was useful")
                                                                continue
                                        
                                                        except Exception as ex:
                                                            if self.DEBUG:
                                                                print("Error getting href: " + str(ex))
                                                            continue
                        
                                                        if self.DEBUG:
                                                            print("href: " + str(property_href))
                        
                                                        if property_href != "" and property_href != None:
                                                            #print("property_href = " + str(property_href))
                                                            property_result = self.api_get(property_href)
                                                            if self.DEBUG:
                                                                print("api result: " + str(property_result))
                                    
                                                            if property_result != None:
                                                                if hasattr(property_result, 'error') or 'error' in property_result:
                                                                    if self.DEBUG:
                                                                        print("get property value: get_api returned an error.")
                                                                    continue
                                                                    #api_error_count += 1
                                        
                                                                    # try again
                                                                    #time.sleep(2)
                                                                    #property_result = self.api_get(property_href)
                                    
                                                                #if hasattr(property_result, 'error') or 'error' in property_result:
                                                                #    if self.DEBUG:
                                                                #        print("darn, two API errors in a row")
                                                                #    continue
                                            
                                                                else:
                                                                    if self.DEBUG:
                                                                        print("api call went ok")
                                                                    if property_href != None:
                                                                        property_id = property_href.rsplit('/', 1)[-1]
                                                                        if property_id in property_result:
                                                                            value = property_result[property_id]
                                                                            if self.DEBUG:
                                                                                print(str(property_id) + " gave: " + str(value))
                                            
                                                                            try:
                                                                                test = int(value) # TODO: does this really raise an exception if not a number?
                                                                                if self.DEBUG:
                                                                                    print('api result was a number')
                                                                            except:
                                                                                if self.DEBUG:
                                                                                    print('value was not a number, skipping device')
                                                                                continue
                                            
                                                                            real_total_power += value
                                                                            if self.DEBUG:
                                                                                print("------ > total_power is now: " + str(total_power))
                                                    
                                                                        else:
                                                                            if self.DEBUG:
                                                                                print("Error, expected property ID (" + property_id + ") was not in response: " + str(property_result))
        
                                                            else:
                                                                if self.DEBUG:
                                                                    print("property result from API was None?")
                                                
                                            
                                                    except Exception as ex:
                                                        print("Error while looping over power property: " + str(ex))

                                            else:
                                                if self.DEBUG:
                                                    print("property has no title?")
                        if self.DEBUG:
                            print("Total power draw: " + str(total_power))
                            
                        if int(real_total_power) >= 0:
                            self.real_total_power = round(real_total_power, 1)
                            self.set_value_on_thing('real_wattage',self.real_total_power)
                            
                        #self.devices['energyuse'].properties['wattage'].update( total_power )
                        
                    
                    
                        # Next, calculate the virtual wattage
                        
                        
                        virtual_total_power = 0;
                        for virtual in self.persistent_data['virtual']:
                            if self.DEBUG:
                                print("\nlooping over virtual device: " + str(virtual))
                                print("-- details: " + str(self.persistent_data['virtual'][virtual]))
                            if 'deleted_time' in self.persistent_data['virtual'][virtual]:
                                if self.DEBUG:
                                    print("skipping deleted virtual device: " + str(self.persistent_data['virtual'][virtual]))
                            elif 'created_time' in self.persistent_data['virtual'][virtual] and 'kwh' in self.persistent_data['virtual'][virtual]:
                                if self.persistent_data['virtual'][virtual]['created_time'] < (time.time() - 600): # should be at least five minutes old, to avoid counting devices that are eroneous.
                                    
                                    virtual_device_power = 1000 * ( float(self.persistent_data['virtual'][virtual]['kwh']) / 24 )
                                    if self.DEBUG:
                                        print("virtual device power: " + str(virtual_device_power))
                                        #print("adding virtual device use power: " + str(self.persistent_data['virtual'][virtual]['kwh']) + ", with used so far today: " + str(device_delta))
                                    virtual_total_power = virtual_total_power + virtual_device_power
                                else:
                                    if self.DEBUG:
                                        print("Skipping virtual devices that was created in the last 10 minutes")
                            else:
                                if self.DEBUG:
                                    print("Virtual data was (partially) missing?: " + str(self.persistent_data['virtual'][virtual]))
                                    
                            if self.DEBUG:
                                print("new virtual_total_power: " + str(virtual_total_power))
                    
                    
                        # Set the virtual power on the thing
                        #if virtual_total_power > 0:
                        self.set_value_on_thing('virtual_wattage',round(virtual_total_power,1))
                        
                        
                        # Set the combined power on the thing
                        self.total_power = round(real_total_power + virtual_total_power,1)
                        self.set_value_on_thing('wattage',self.total_power)
                        
                except Exception as ex:
                    print("general error while getting total power: " + str(ex))
                        
                
            
            


    #
    #  KWH
    #

    def get_energy_data(self, store_data):
        if self.DEBUG:
            print("in get_energy_data")
        
        
        try:
            if self.things == None:
                if self.DEBUG:
                    print("Error: get_energy_data: no valid things data. Stopping.")
                return
            
            self.last_kwh_measurement_time = str( int(time.time()) )
            day_delta = 0
            kwh_total = 0
            
            device_count = 0
            api_error_count = 0
            
            #self.persistent_data['energy'] = {}
            #new_simple_things = {}
            for thing in self.things:
                #print('looping over thing: ', thing)
                #print( str(thing['@type']) )
                if '@type' in thing:
                #if hasattr(thing, '@type'):
                    #print('looping over thing. @type: ' + str(thing['@type']))
                #if '@type' in thing:
                    if 'EnergyMonitor' in thing['@type']:
                        thing_id = str(thing['id'].rsplit('/', 1)[-1])
                        if self.DEBUG:
                            print("\nenergy monitor device spotted: " + str(thing_id) )
                        #print("thing = "  + str(thing))
                        #print("thing_id = "  + str(thing_id))
                        #new_simple_things[thing_id] = []
                        #if self.DEBUG:
                        #    print("thing['properties']: " + str(thing['properties']))
                        if 'properties' in thing:
                            if self.DEBUG:
                                print("-properties was in thing")
                                #print(thing['properties'])
                                #print(json.dumps(thing['properties'], indent=4))
                            
                            energy_property_found = False
                            
                            for proppy in thing['properties']:
                                #if self.DEBUG:
                                #    print("proppy: " + str(proppy))
                                
                                if 'title' in thing['properties'][proppy]:
                                    if thing['properties'][proppy]['title'].lower() == 'energy':
                                        energy_property_found = True
                                        try:
                                            thing_property_key = proppy #'energy'
                                            if self.DEBUG:
                                                print("--energy property: ", thing['properties'][thing_property_key])
                                    
                                            
                                            device_count += 1
                                    
                                            if store_data:
                                                if not 'energy' in self.persistent_data:
                                                    if self.DEBUG:
                                                        print("--energy was not in persistent data yet somehow")
                                                    self.persistent_data['energy'] = {}
                                            
                                                if not self.last_kwh_measurement_time in self.persistent_data['energy']:
                                                    if self.DEBUG:
                                                        print("--adding time to energy")
                                                    self.persistent_data['energy'][str(self.last_kwh_measurement_time)] = {}
                                    

                                
                                            property_href = ""
                                            try:
                                                if 'forms' in thing['properties'][thing_property_key]:
                                                    if len(thing['properties'][thing_property_key]['forms']) > 0:
                                                        #if self.DEBUG:
                                                        #    print("forms")
                                                        property_href = thing['properties'][thing_property_key]['forms'][0]['href']
                                        
                                                if property_href == "":
                                                    if 'links' in thing['properties'][thing_property_key]:
                                                        if len(thing['properties'][thing_property_key]['links']) > 0:
                                                            #if self.DEBUG:
                                                            #    print("links")
                                                            property_href = thing['properties'][thing_property_key]['links'][0]['href']

                                                if property_href == "":
                                                    if self.DEBUG:
                                                        print("Error, neither links nor forms was useful")
                                                    continue
                                                
                                            except Exception as ex:
                                                if self.DEBUG:
                                                    print("Error getting href: " + str(ex))
                                                continue
                                                
                                            if self.DEBUG:
                                                print("href: " + str(property_href))
                                
                                            if property_href != "" and property_href != None:
                                                #print("property_href = " + str(property_href))
                                                property_result = self.api_get(property_href)
                                                if self.DEBUG:
                                                    print("api result: " + str(property_result))
                                            
                                        
                                            
                                                if property_result != None:
                                                    if hasattr(property_result, 'error') or 'error' in property_result:
                                                        if self.DEBUG:
                                                            print("get property value: get_api returned an error. Trying again in 10 seconds...")
                                                        api_error_count += 1
                                                
                                                        # try again
                                                        time.sleep(10)
                                                        property_result = self.api_get(property_href)
                                            
                                                    if hasattr(property_result, 'error') or 'error' in property_result:
                                                        if self.DEBUG:
                                                            print("darn, two API errors in a row")
                                                    
                                                    else:
                                                        if self.DEBUG:
                                                            print("api call went ok")
                                                        if property_href != None:
                                                            property_id = property_href.rsplit('/', 1)[-1]
                                                            if property_id in property_result:
                                                                value = property_result[property_id]
                                                                if self.DEBUG:
                                                                    print(str(property_id) + " gave: " + str(value))
                                                    
                                                                try:
                                                                    test = int(value)
                                                                    if self.DEBUG:
                                                                        print('api result was a number')
                                                                except:
                                                                    if self.DEBUG:
                                                                        print('value was not a number, skipping device')
                                                                    continue
                                                    
                                                                kwh_total += value
                                                                if self.DEBUG:
                                                                    print("---------- > > kwh_total is now: " + str(kwh_total))
                                                    
                                                                if store_data:
                                                                    # We only store the new values at the end of the day
                                                                    self.persistent_data['energy'][str(self.self.last_kwh_measurement_time)][thing_id] = round(value, 5) #{'value':value}
                                            
                                                                else:
                                                                    if self.DEBUG:
                                                                        print('The new value is not being stored because it is not midnight yet')
                                                                #self.save_persistent_data()
                                                                try:
                                                                    if 'previous_time' in self.persistent_data:
                                                                        previous_time = str(self.persistent_data['previous_time'])
                                                                        if self.DEBUG:
                                                                            print("previous_time (that data was stored) was in persistent data: " + str(previous_time))
                                                                        #print("self.persistent_data['energy'][previous_time]: " + str(self.persistent_data['energy'][str(previous_time)]))
                                                    
                                                                        #print("self.persistent_data['energy'] = " + str(self.persistent_data['energy']))
                                                        
                                                    
                                                                        if previous_time in self.persistent_data['energy']:
                                                                            if self.DEBUG:
                                                                                print("self.persistent_data['energy'][previous_time] = " + str(self.persistent_data['energy'][previous_time]))
                                                            
                                                                            if thing_id in self.persistent_data['energy'][previous_time]:
                                                                                if self.DEBUG:
                                                                                    print('same thing_id spotted in previous time')
                                                                                previous_value = self.persistent_data['energy'][previous_time][thing_id]
                                                                                if self.DEBUG:
                                                                                    print("previous " + str(property_id) + " value was: " + str(previous_value))
                                                                                    print("current value: " + str(value) + ", previous_value was: " + str(previous_value))
                                                                                    #print("TYPES. value " + str(type(value)) + ", previous_value was: " + str(type(previous_value)))
                                                                
                    
                                                                                if value > previous_value:
                                                                                    if self.DEBUG:
                                                                                        print("new device kwh value was bigger than midnight value")
                                                                                    device_delta = value - previous_value
                                                                                    if self.DEBUG:
                                                                                        print("since midnight this device has used: " + str(device_delta))
                                                                                    day_delta = day_delta + device_delta
                                                                                    if self.DEBUG:
                                                                                        print("day_delta  is now: " + str(day_delta ))
                                                                                else:
                                                                                    if self.DEBUG:
                                                                                        print("Warning, device had same kwh as (or lower value than? that would be weird..) before, so not adding to day delta. Before: " + str(previous_value) + " , Now: " + str(value))
                                                                            else:
                                                                                if self.DEBUG:
                                                                                    print("there was data for yesterday, but this device was not present in it: " + str(thing_id))
                                                        
                                                                        else:
                                                                            if self.DEBUG:
                                                                                print("Warning, that previous time was not in the data somehow.")
                                                    
                                                                    else:
                                                                        if self.DEBUG:
                                                                            print("'previous time' variable was not found in the persistent data yet. The addon was probably just installed.")
                                                
                                                                except Exception as ex:
                                                                    print("Error comparing to previous time: " + str(ex))
                                                                    
                                                            else:
                                                                if self.DEBUG:
                                                                    print("Error, expected property ID (" + property_id + ") was not in response: " + str(property_result))
                                                else:
                                                    if self.DEBUG:
                                                        print("Error, api returned None as the energy property value. Device probably not connected.")
                                                        
                                        except Exception as ex:
                                            print("Error while looping over energy property: " + str(ex))
                                    
                                else:
                                    if self.DEBUG:
                                        print("Error, property has no title?")                   
                            
                            if energy_property_found == False:
                                if self.DEBUG:
                                    print("that's odd, there was no property called energy in this energy monitoring device: " + str(thing_id))
            
            
            if device_count > 0 and device_count == api_error_count:
                if self.DEBUG:
                    print("API gave 100 percent errors. Aborting this run...")
                return
                                 
            if self.DEBUG:
                print(" ")
                print("=============> looped over all real things. day_delta: " + str(day_delta) + " <===============")
                print(" ")



            
                


            try:
                
                if kwh_total != 0:
                    self.persistent_data['grand_total'] = round(kwh_total, 4)
                
                #
                # Hourly update
                #
                """
                if self.DEBUG:
                    print("total-ever reported energy use by monitoring devices: " + str(kwh_total) )
                if self.previous_hour_total == None:
                    print("storing previous_hour_total for quick hourly insight")
                    self.previous_hour_total = kwh_total
                else:
                    if kwh_total >= self.previous_hour_total:
                        hourly_delta_from_total = kwh_total - self.previous_hour_total
                        self.set_value_on_thing('lasthour',hourly_delta_from_total)
                        self.previous_hour_total = kwh_total
                """
            
                current_date = datetime.datetime.now() 
                current_hour = current_date.hour
            
                
            
            
                # VIRTUAL
                
                # Add virtual devices energy use
                virtual_device_exists = False
                for virtual in self.persistent_data['virtual']:
                    if self.DEBUG:
                        print("\nlooping over virtual device: " + str(virtual))
                    if 'deleted_time' in self.persistent_data['virtual'][virtual]:
                        if self.DEBUG:
                            print("skipping deleted virtual device: " + str(self.persistent_data['virtual'][virtual]))
                    elif 'created_time' in self.persistent_data['virtual'][virtual] and 'kwh' in self.persistent_data['virtual'][virtual]:
                        if self.persistent_data['virtual'][virtual]['created_time'] < (time.time() - 600): # should be at least five minutes old, to avoid counting devices that are eroneous.
                            virtual_device_delta = current_hour * ( float(self.persistent_data['virtual'][virtual]['kwh']) / 24 )
                            if self.DEBUG:
                                print("adding virtual device use kWH: " + str(self.persistent_data['virtual'][virtual]['kwh']) + ", with used so far today: " + str(device_delta))
                            day_delta = day_delta + virtual_device_delta
                
                            virtual_device_exists = True
                        else:
                            if self.DEBUG:
                                print("Virtual device was created in the last 10 minutes, ignoring for now")
                    else:
                        if self.DEBUG:
                            print("Virtual data was (partially) missing?: " + str(self.persistent_data['virtual'][virtual]))
                            
                # Indicate in the data that at on this day at least one virtual device existed and should be reconstructed.
                # (Actually storing the virtual data is avoided to save space)
                if store_data and virtual_device_exists:
                    self.persistent_data['energy'][str(self.last_kwh_measurement_time)][ 'virt' ] = 0
                
                
                if not 'previous_hour' in self.persistent_data:
                    if self.DEBUG:
                        print("saving initial previous_hour to persistent data.")
                    self.persistent_data['previous_hour'] = current_hour
                
                else:
                    if self.DEBUG:
                        print("current hour should be 1 more than previous hour (or looped back to 0):")
                        print("self.persistent_data['previous_hour']: " + str(self.persistent_data['previous_hour']))
                        print("current_hour: " + str(current_hour))
                
                    if self.persistent_data['previous_hour'] != current_hour:
                        if self.persistent_data['previous_hour_day_delta'] != None:
                            if self.DEBUG:
                                print("hour-delta. day_delta: " + str(day_delta))
                                print("hour-delta. self.persistent_data['previous_hour_day_delta']: " + str(self.persistent_data['previous_hour_day_delta']))
                            if day_delta >= self.persistent_data['previous_hour_day_delta']:
                                if self.DEBUG:
                                    print("day delta was bigger than the previous hour, so should update hourly use property on thing")
                                hourly_delta = day_delta - self.persistent_data['previous_hour_day_delta']
                                if self.DEBUG:
                                    print("hourly change: " + str(hourly_delta))
                                self.set_value_on_thing('lasthour',hourly_delta)
                            else:
                                if self.DEBUG:
                                    print("day_delta was same or smaller than previous self.previous_hour_day_delta. No additional energy used this hour?")
                      
                            #if store_data:
                            #    self.persistent_data['previous_hour_day_delta'] = 0 # at midnight we calculate the last hourly delta (above), and then reset, so that at 1am it will use 0 as the previous value
            
                        if day_delta > 0:
                            self.persistent_data['previous_hour_day_delta'] = round(day_delta, 4) # to kwh of the day so far, to check if that today-so-far value has grown over the last hour.
                            self.persistent_data['previous_hour'] = current_hour
                        else:
                            if self.DEBUG:
                                print("Error, day_delta was less than zero somehow")
                            return
                
                    else:
                        if self.DEBUG:
                            print("A measurement was already taken at the start of this hour. Addon was likely restarted.")
                      
            
                # 
                #  Yesterday, set at mignight
                #
            
                if store_data:
                    #if not 'previous_time' in self.persistent_data:
                    if self.DEBUG:
                        print("MIDNIGHT. doing yesterday update. Saving 'previous_time' and day_delta to persistent data")
                    self.persistent_data['previous_time'] = str(self.last_kwh_measurement_time)
                    #self.persistent_data['previous_delta'] = round(day_delta, 5)
                
                    self.persistent_data['yesterday_total'] = round(day_delta, 4)
                    #self.persistent_data['energy'][self.last_kwh_measurement_time]['day_delta'] = round(day_delta, 4)
                
                    self.set_value_on_thing('yesterday', round(day_delta, 4))
                
                    self.set_value_on_thing('today', round(day_delta, 4))
                    time.sleep(.5)
                    self.set_value_on_thing('today', 0) # reset today value to 0
                    self.persistent_data['previous_hour_day_delta'] = 0
                
                    if self.persistent_data['previous_hour'] != 0:
                        if self.DEBUG:
                            print("ERROR! The hourly update had not already set self.persistent_data['previous_hour'] to 0")
                        self.persistent_data['previous_hour'] = 0
            
                #
                # Today - updates hourly throughout the day
                #
            
                elif day_delta > 0:
                    if self.DEBUG:
                        print("Setting current day delta as today on thing")
                    self.set_value_on_thing('today', round(day_delta, 4)) # set today value to the differnce from what it was at midnight
                else:
                    if self.DEBUG:
                        print("day_delta was 0. No energy used since midnight?")
                        
                
            except Exception as ex:
                if self.DEBUG:
                    print("Error using new data to set values on things: " + str(ex))
            # The total energy consumed ever, since the monitoring devices were bought
            

            self.save_persistent_data()
            
            
        
        except Exception as ex:
            if self.DEBUG:
                print("error in get_energy_data: " + str(ex))





    def prune_data(self):
        #if self.DEBUG:
        #    print("ENERGY USE DEBUGGING: PRUNING TEMPORARILY DISABLED")
        #    return
            
        try:
            current_timestamp = time.time()
            retention_window = 2629800 * int(self.persistent_data['data_retention_months']) # months, in seconds
            device_detail_window = 86400 * int(self.persistent_data['device_detail_days']) # days, in seconds
        
            changes_made = False
            for timestamp in self.persistent_data['energy']:
                if int(timestamp) < current_timestamp - retention_window:
                    if self.DEBUG:
                        print("removing old data")
                    del self.persistent_data['energy'][timestamp]
                    changes_made = True

            """
            # Very hard to do server side, it turns out. Doing it client side for now :-(
            for timestamp in self.persistent_data['energy']:
                if int(timestamp) < current_time - device_detail_window:
                    # prune device details and replace them with a single device
                    day_total = 0
                    device_found = False
                    devices_to_delete = []
                    
                    for device_id in self.persistent_data['energy'][timestamp]:
                        if device_id != 'total':
                            device_found = True
                            if self.DEBUG:
                                print("adding up old device data from: " + str(device_id))
                            day_total = day_total + self.persistent_data['energy'][timestamp][device_id]
                            devices_to_delete.append(device_id)
                    
                    for del_device_id in devices_to_delete:
                        if self.DEBUG:
                            print("removing old device data: " + str(del_device_id))
                        del self.persistent_data['energy'][timestamp][del_device_id]
                    
                    if device_found:
                        if day_total != 0:
                            self.persistent_data['energy'][timestamp]['total'] = day_total
                            changes_made = True
        
            """
            if changes_made:
                if self.DEBUG:
                    print("Data pruning: some old data was deleted")
                self.save_persistent_data()
                
            elif self.DEBUG:
                print("Data pruning: found no data that needed to be deleted")
                    
        except Exception as ex:
            if self.DEBUG:
                print("error during data pruning: " + str(ex))



    # Gets all devices from the Webthings API. Needed to look for energy monitor devices.
    def update_simple_things(self):
        if self.DEBUG:
            print("in update_simple_things")
        
        if self.update_simple_things_running == True:
            if self.DEBUG:
                print("update_simple_things already in progress, aborting")
            return
            
        self.update_simple_things_running = True
        try:
            fresh_things = self.api_get("/things")
            if self.DEBUG:
                print("- Did the things API call.")
                #print(str(self.things))
            
            if hasattr(fresh_things, 'error'):
                if self.DEBUG:
                    print("try_update_things: get_api returned an error.")
                
                if fresh_things['error'] == '403':
                    if self.DEBUG:
                        print("Spotted 403 error, will try to switch to https API calls")
                    self.persistent_data['api_server'] = 'https://127.0.0.1:4443'
                    self.save_persistent_data()
                    #fresh_things = self.api_get("/things")
                    #if self.DEBUG:
                        #print("Tried the API call again, this time at port 4443. Result: " + str(fresh_things))
                return
            
            self.things = fresh_things
            self.got_fresh_things_list = True
            if self.DEBUG:
                print("update_simple_things: got fresh things")
            
        except Exception as ex:
            if self.DEBUG:
                print("Error updating simple_things: " + str(ex))
                
        self.update_simple_things_running = False



    #def handle_device_saved(self, device_id, device):
        #if self.DEBUG:
        #    print("Energy use -> in handle_device_saved")


    def start_pairing(self, timeout):
        """Starting the pairing process."""
        if self.DEBUG:
            print("\nEnergy use -> in start_pairing\n")

    def cancel_pairing(self):
        """Cancel the pairing process."""
        if self.DEBUG:
            print("Energy use -> in cancel_pairing")
        
        self.update_simple_things_countdown = 60 # waits a minute until after pairing ended to look for new devices. With Zigbee devices it can take longer than a minute.
            
#
# SUPPORT METHODS
#


    def set_value_on_thing(self, property_name, value):
        if self.DEBUG:
            print("set_value_on_thing: new kwh value for: " + str(property_name) + " -> " + str(value))
        try:
            if 'energyuse' in self.devices:
                if str(property_name) in self.devices['energyuse'].properties:
                    self.devices['energyuse'].properties[property_name].update( value )
                else:
                    print("property did not exist?")
            else:
                print("Error: could not set value on thing, the thing did not exist yet")
        except Exception as ex:
            if self.DEBUG:
                print("Error setting yesterday value of device:" + str(ex))



    def unload(self):
        if self.DEBUG:
            print("Shutting down Energy Use.")
        self.running = False
        self.save_persistent_data()



    def remove_thing(self, device_id):
        try:
            obj = self.get_device(device_id)
            self.handle_device_removed(obj)                     # Remove from device dictionary
            if self.DEBUG:
                print("User removed Energy Use device")
        except:
            if self.DEBUG:
                print("Could not remove things from devices")



    def save_persistent_data(self):
        if self.DEBUG:
            print("Saving to persistence data store")

        try:
            if not os.path.isfile(self.persistence_file_path):
                open(self.persistence_file_path, 'a').close()
                if self.DEBUG:
                    print("Created an empty persistence file")
            else:
                if self.DEBUG:
                    print("Persistence file existed. Will try to save to it.")

            with open(self.persistence_file_path) as f:
                if self.DEBUG:
                    print("saving: " + str(self.persistent_data))
                try:
                    json.dump( self.persistent_data, open( self.persistence_file_path, 'w+' ) ,indent=4)
                except Exception as ex:
                    print("Error saving to persistence file: " + str(ex))
                return True
            #self.previous_persistent_data = self.persistent_data.copy()

        except Exception as ex:
            if self.DEBUG:
                print("Error: could not store data in persistent store: " + str(ex) )
            return False




#
#  API
#

    def api_get(self, api_path,intent='default'):
        """Returns data from the WebThings Gateway API."""
        if self.DEBUG:
            print("GET PATH = " + str(api_path))
        if self.persistent_data['token'] == None:
            print("API GET: PLEASE ENTER YOUR AUTHORIZATION CODE IN THE SETTINGS PAGE")
            return []
        
        try:
            r = requests.get(self.api_server + api_path, headers={
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Authorization': 'Bearer ' + str(self.persistent_data['token']),
                }, verify=False, timeout=5)
            if self.DEBUG:
                print("API GET: " + str(r.status_code) + ", " + str(r.reason))

            if r.status_code != 200:
                if self.DEBUG:
                    print("API returned a status code that was not 200. It was: " + str(r.status_code))
                return {"error": str(r.status_code)}
                
            else:
                if r.text != None:
                    if len(r.text) > 0:
                        to_return = r.text
                        try:
                            if self.DEBUG:
                                print("api_get: received: " + str(to_return)[:30])
                            #for prop_name in r:
                            #    print(" -> " + str(prop_name))
                    
                            if not '{' in r.text:
                                if self.DEBUG:
                                    print("api_get: response was not json (gateway 1.1.0 does that). Turning into json...")
                    
                                if 'things/' in api_path and '/properties/' in api_path:
                                    if self.DEBUG:
                                        print("properties was in api path: " + str(api_path))
                                    likely_property_name = api_path.rsplit('/', 1)[-1]
                                    to_return = {}
                                    to_return[ likely_property_name ] = json.loads(r.text)
                                    if self.DEBUG:
                                        print("returning fixed: " + str(to_return))
                                    return to_return
                                
                        except Exception as ex:
                            print("api_get_fix error: " + str(ex))
                        
                        if self.DEBUG:
                            print("returning without 1.1.0 fix, was already json")
                        return json.loads(r.text)
                    
                    else:
                        if self.DEBUG:
                            print("API_GET: strange, text in response was zero length")
                else:
                    if self.DEBUG:
                        print("API_GET: strange, there was no text in response")
        except Exception as ex:
            print("Error doing http request/loading returned json: " + str(ex))
            
            return {"error": 500}






#
# DEVICE
#

class EnergyUseDevice(Device):
    """Energy Use device type."""

    def __init__(self, adapter):
        """
        Initialize the object.
        adapter -- the Adapter managing this device
        """

        Device.__init__(self, adapter, 'energyuse')

        self._id = 'energyuse'
        self.id = 'energyuse'
        self.adapter = adapter
        self.DEBUG = adapter.DEBUG

        self.name = 'Energy use'
        self.title = 'Energy use'
        self.description = 'Calculate the total electricty used by energy monitoring power sockets'
        self._type = ['EnergyMonitor','MultiLevelSensor']
        #self.connected = False

        try:
            
            self.properties["virtual_wattage"] = EnergyUseProperty(
                            self,
                            "virtual_wattage",
                            {
                                'title': 'Virtual power',
                                'type': 'number',
                                'readOnly': True,
                                'minimum': 0,
                                'multipleOf':0.1,
                                'unit': 'watt'
                            },
                            self.adapter.virtual_total_power)
            
            
            self.properties["real_wattage"] = EnergyUseProperty(
                            self,
                            "real_wattage",
                            {
                                'title': 'Real power',
                                'type': 'number',
                                'readOnly': True,
                                'minimum': 0,
                                'multipleOf':0.1,
                                'unit': 'watt'
                            },
                            self.adapter.real_total_power)
            
            
            self.properties["wattage"] = EnergyUseProperty(
                            self,
                            "wattage",
                            {
                                '@type': 'InstantaneousPowerProperty',
                                'title': 'Total power',
                                'type': 'number',
                                'readOnly': True,
                                'minimum': 0,
                                'multipleOf':0.1,
                                'unit': 'watt'
                            },
                            self.adapter.total_power)
            
            
            yesterday_total = None
            if 'yesterday_total' in self.adapter.persistent_data:
                yesterday_total = self.adapter.persistent_data['yesterday_total']
            
            self.properties["yesterday"] = EnergyUseProperty(
                            self,
                            "yesterday",
                            {
                                'title': 'Yesterday',
                                'type': 'number',
                                'readOnly': True,
                                'minimum': 0,
                                'multipleOf':0.001,
                                'unit': 'KWh'
                            },
                            yesterday_total)
 
 
            self.properties["today"] = EnergyUseProperty(
                            self,
                            "today",
                            {
                                '@type': 'LevelProperty',
                                'title': 'Today',
                                'type': 'number',
                                'readOnly': True,
                                'minimum': 0,
                                'multipleOf':0.001,
                                'unit': 'KWh'
                            },
                            None)
 
            
            self.properties["lasthour"] = EnergyUseProperty(
                            self,
                            "lasthour",
                            {
                                'title': "Previous hour",
                                'type': 'number',
                                'readOnly': True,
                                'minimum': 0,
                                'multipleOf':0.001,
                                'unit': 'KWh'
                            },
                            None)
 

        except Exception as ex:
            if self.DEBUG:
                print("error adding properties: " + str(ex))

        if self.DEBUG:
            print("Energy use thing has been created.")




#
# PROPERTY
#

class EnergyUseProperty(Property):

    def __init__(self, device, name, description, value):
        Property.__init__(self, device, name, description)
        self.device = device
        self.name = name
        self.title = name
        self.description = description # dictionary
        self.value = value
        self.set_cached_value(value)
        self.device.notify_property_changed(self)
        
        if self.device.DEBUG:
            print("property: initiated: " + str(self.title))


    def set_value(self, value):
        #print("property: set_value called for " + str(self.title))
        #print("property: set value to: " + str(value))
        self.set_cached_value(value)
        self.device.notify_property_changed(self)
        
  

    def update(self, value):
        try:
            
            #print(str(type(value)))
            if value != None:
                if self.device.DEBUG:
                    print("[...] property update. " + str(self.title) + " -> " + str(value))
            else:
                if self.device.DEBUG:
                    print("[...] property update. " + str(self.title) + " -> None")
        
            if value != self.value:
                self.value = value
                self.set_cached_value(value)
                self.device.notify_property_changed(self)
            else:
                if self.device.DEBUG:
                    print("-it was already that value, igoring property update")
        except Exception as ex:
            if self.device.DEBUG:
                print("property: error updating value: " + str(ex))


    
            

def kill_process(target):
    try:
        os.system( "sudo killall " + str(target) )

        #print(str(target) + " stopped")
        return True
    except:

        #print("Error stopping " + str(target))
        return False



def run_command(cmd, timeout_seconds=20):
    try:
        
        p = subprocess.run(cmd, timeout=timeout_seconds, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True, universal_newlines=True)

        if p.returncode == 0:
            return p.stdout # + '\n' + "Command success" #.decode('utf-8')
            #yield("Command success")
        else:
            if p.stderr:
                return "Error: " + str(p.stderr) # + '\n' + "Command failed"   #.decode('utf-8'))

    except Exception as e:
        print("Error running command: "  + str(e))
        