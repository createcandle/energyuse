"""Energy Use API handler."""

import os
import re
import json
import time
from time import sleep
import socket
import requests
import subprocess


#from .util import valid_ip, arpa_detect_gateways

#from datetime import datetime,timedelta


try:
    from gateway_addon import APIHandler, APIResponse
    #print("succesfully loaded APIHandler and APIResponse from gateway_addon")
except:
    print("Import APIHandler and APIResponse from gateway_addon failed. Use at least WebThings Gateway version 0.10")
    sys.exit(1)


#from pyradios import RadioBrowser


class EnergyUseAPIHandler(APIHandler):
    """Energy Use API handler."""

    def __init__(self, adapter, verbose=False):
        """Initialize the object."""
        #print("INSIDE API HANDLER INIT")
        
        self.adapter = adapter
        self.DEBUG = self.adapter.DEBUG


            
        # Intiate extension addon API handler
        try:
            manifest_fname = os.path.join(
                os.path.dirname(__file__),
                '..',
                'manifest.json'
            )

            with open(manifest_fname, 'rt') as f:
                manifest = json.load(f)

            APIHandler.__init__(self, manifest['id'])
            self.manager_proxy.add_api_handler(self)
            

            if self.DEBUG:
                print("self.manager_proxy = " + str(self.manager_proxy))
                print("Created new API HANDLER: " + str(manifest['id']))
        
        except Exception as e:
            print("Error: failed to init API handler: " + str(e))
        
        #self.rb = RadioBrowser()
                        

#
#  HANDLE REQUEST
#

    def handle_request(self, request):
        """
        Handle a new API request for this handler.

        request -- APIRequest object
        """
        #print("in handle_request")
        try:
        
            if request.method != 'POST':
                return APIResponse(status=404)
            
            if request.path == '/ajax':

                try:
                    #if self.DEBUG:
                    #    print("API handler is being called")
                    #    print("request.body: " + str(request.body))
                    
                    action = str(request.body['action']) 
                    
                    if action == 'init':
                        if self.DEBUG:
                            print("in init")
                        
                        self.adapter.persistent_data['token'] = str(request.body['jwt']) 
                        self.adapter.save_persistent_data()
                        self.adapter.prune_data()
                        
                        #print(str(self.adapter.persistent_data))
                        
                        return APIResponse(
                          status=200,
                          content_type='application/json',
                          content=json.dumps({'persistent':self.adapter.persistent_data,
                                              'last_hour_time':self.adapter.last_kwh_measurement_time,
                                              'live_interval':self.adapter.live_interval,
                                              'data_blur':self.adapter.persistent_data['data_blur'],
                                              'debug':self.adapter.DEBUG
                                              }),
                        )
                        
                    
                    if action == 'poll':
                        if self.DEBUG:
                            print("in poll")
                        
                        return APIResponse(
                          status=200,
                          content_type='application/json',
                          content=json.dumps({
                                              'live':self.adapter.live,
                                              'real_total_power':self.adapter.real_total_power,
                                              'virtual_total_power':self.adapter.virtual_total_power,
                                              'real_total_power':self.adapter.real_total_power,
                                              'total_real_kwh_since_midnight':self.adapter.total_real_kwh_since_midnight,
                                              'total_virtual_kwh_since_midnight':self.adapter.total_virtual_kwh_since_midnight,
                                              'previous_hour_day_delta':self.adapter.persistent_data['previous_hour_day_delta'],
                                              'data_blur':self.adapter.persistent_data['data_blur']
                                              })
                        )
                    
                    
                    # Save the JWT token so that the addon can access things data
                    if action == 'save_token':
                        if self.DEBUG:
                            print("in save_token")
                        
                        token_saved = False
                        
                        if len(str(request.body['jwt'])) > 10:
                            self.adapter.persistent_data['token'] = str(request.body['jwt']) 
                            self.adapter.save_persistent_data()
                            token_saved = True
                        else:
                            if self.DEBUG:
                                print("Error, token was too short?")
                        
                        return APIResponse(
                          status=200,
                          content_type='application/json',
                          content=json.dumps({"state":token_saved}),
                        )
                        
                    
                    # Save the kWh price to persistent data
                    if action == 'save_kwh_price':
                        if self.DEBUG:
                            print("in save_kwh_price")
                        
                        self.adapter.persistent_data['kwh_price'] = float(request.body['kwh_price'])
                        self.adapter.save_persistent_data()
                        
                        return APIResponse(
                          status=200,
                          content_type='application/json',
                          content=json.dumps({"state":True}),
                        )
                        
                        
                    # Add a new virtual device
                    if action == 'add_virtual_device':
                        if self.DEBUG:
                            print("in add_virtual_device")
                        
                        state = True
                        
                        if 'name' not in request.body or 'name' not in request.body:
                            state = False
                            
                        else:
                            if len(str(request.body['name'])) == 0 or len(str(request.body['name'])) > 80:
                                state = False
                            if len(request.body['kwh']) == 0:
                                state = False
                            elif request.body['kwh'] == 0:
                                state = False
                        
                            if state == True:
                                self.adapter.persistent_data['virtual'][ str(request.body['name']) ] = {
                                            "name":str(request.body['name']),
                                            "kwh":float(request.body['kwh']),
                                            "created_time":int(time.time())
                                            }
                                self.adapter.save_persistent_data()
                        
                        return APIResponse(
                          status=200,
                          content_type='application/json',
                          content=json.dumps({"state":state,"virtual":self.adapter.persistent_data['virtual']}),
                        )
                        
                        
                    # Delete a virtual device
                    if action == 'delete_virtual_device':
                        if self.DEBUG:
                            print("in delete_virtual_device")
                        
                        state = False
                        
                        if not 'name' in request.body:
                            if self.DEBUG:
                                print("error, missing name parameter, cannot delete virtual item")
                                
                        elif not 'virtual' in self.adapter.persistent_data:
                            if self.DEBUG:
                                print("error, virtual devices dict not in persistent data somehow")
                            
                        else:
                            if str(request.body['name']) in self.adapter.persistent_data['virtual']:
                                if 'created_time' in self.adapter.persistent_data['virtual'][ str(request.body['name']) ]:
                            
                                    # if the device was created less than a day ago, remove the entire thing.
                                    if self.adapter.persistent_data['virtual'][ str(request.body['name']) ]['created_time'] > (time.time() - 86400): 
                                        self.adapter.persistent_data['virtual'].pop( str(request.body['name']) )
                                    else:
                                        self.adapter.persistent_data['virtual'][ str(request.body['name']) ]['deleted_time'] = time.time()
                                    
                                    state = True
                                    self.adapter.save_persistent_data()
                            else:
                                if self.DEBUG:
                                    print("error, virtual item not in dict. Already deleted?")
    
                        return APIResponse(
                          status=200,
                          content_type='application/json',
                          content=json.dumps({"state":state,"virtual":self.adapter.persistent_data['virtual']}),
                        )
                        
                        
                    # devices can be ignored. This needs the device ID and a boolean 'choice'
                    if action == 'ignore':
                        if self.DEBUG:
                            print("in ignore")
                        
                        state = False
                        
                        if not 'device_id' in request.body:
                            if self.DEBUG:
                                print("error, missing device ID parameter, cannot set ignore state")
                                
                        if not 'choice' in request.body:
                            if self.DEBUG:
                                print("error, missing choice parameter, cannot set ignore state")
                                
                        elif not 'ignore' in self.adapter.persistent_data:
                            if self.DEBUG:
                                print("error, ignore list not in persistent data somehow")
                            
                        else:
                            if bool(request.body['choice']) == True:
                                self.adapter.persistent_data['ignore'].append(str(request.body['device_id']))
                                if self.DEBUG:
                                    print("added device to ignore list")
                            else:
                                self.adapter.persistent_data['ignore'].remove(str(request.body['device_id']))
                                if self.DEBUG:
                                    print("removed device from ignore list")
                            
                            self.adapter.save_persistent_data()
                            state = True
                            
    
                        return APIResponse(
                          status=200,
                          content_type='application/json',
                          content=json.dumps({"state":state,"ignore":self.adapter.persistent_data['ignore']}),
                        )
                        
                        
                        
                    else:
                        return APIResponse(
                            status=404,
                            content_type='application/json',
                            content=json.dumps({"Error":"Unknown api command"}),
                        )
                        
                except Exception as ex:
                    if self.DEBUG:
                        print("Ajax issue: " + str(ex))
                    return APIResponse(
                        status=500,
                        content_type='application/json',
                        content=json.dumps({"Error":"Error in API handler"}),
                    )
                    
            else:
                if self.DEBUG:
                    print("invalid path: " + str(request.path))
                return APIResponse(status=404)
                
        except Exception as e:
            if self.DEBUG:
                print("Failed to handle UX extension API request: " + str(e))
            return APIResponse(
                status=500,
                content_type='application/json',
                content=json.dumps("General API Error"),
            )
        

