(function() {
	class Energyuse extends window.Extension {
	    constructor() {
	      	super('energyuse');
			//console.log("Adding energyuse addon to menu");
      		
			this.addMenuEntry('Energy use');
			
            this.debug = false;
            
            this.all_things = {};
            
            this.only_show_week_total = false;
            this.device_detail_days = 0;
            
			this.attempts = 0;

	      	this.content = '';
			this.item_elements = []; //['thing1','property1'];
			this.all_things;
			this.items_list = [];
			//this.current_time = 0;
            this.last_hour_time = 0; // is called current_time in Python
            this.previous_day_number = -1;

            this.searching = false;
            this.entered_search_page = false;
            
            this.showing_cost = true;
            this.current_energy_price = null;

            this.device_details = {};
            this.show_wattage_details = false;
            
            this.virtual_wattage = 0;

            setTimeout(() => {
                const jwt = localStorage.getItem('jwt');
                //console.log("jwt: ", jwt);
    	        window.API.postJson(
    	          `/extensions/${this.id}/api/ajax`,
    				{'action':'save_token','jwt':jwt}
    	        ).then((body) => {
                    //console.log("energy use delayed update jwt response: ", body);
    	        }).catch((e) => {
    	  			console.log("Error (delayed) saving token: ", e);
    	        });
            }, 6100);
            
            
			fetch(`/extensions/${this.id}/views/content.html`)
	        .then((res) => res.text())
	        .then((text) => {
	         	this.content = text;
	  		 	if( document.location.href.endsWith("extensions/energyuse") ){
					//console.log(document.location.href);
	  		  		this.show();
	  		  	}
	        })
	        .catch((e) => console.error('Failed to fetch content:', e));
            
	    }



		
		hide() {
			//console.log("energyuse hide called");
			
            try{
				clearInterval(this.interval);
                clearInterval(this.wattage_interval);
			}
			catch(e){
				//console.log("no interval to clear? ", e);
			} 
		}
        
        
        

	    show() {
			//console.log("energyuse show called");
			//console.log("this.content:");
			//console.log(this.content);
			
            try{
				clearInterval(this.interval);
			}
			catch(e){
				//console.log("no interval to clear?: ", e);
			}
            
			const main_view = document.getElementById('extension-energyuse-view');
			
			if(this.content == ''){
				return;
			}
			else{
				main_view.innerHTML = this.content;
			}
			
			const list = document.getElementById('extension-energyuse-list');
            
            document.getElementById('extension-energyuse-title').addEventListener('click', (event) => {
                this.show();
            });
            
            
            /*  MENU */
            
            document.getElementById('extension-energyuse-tab-button-overview').addEventListener('click', (event) => {
                document.getElementById('extension-energyuse-overview-page').style.display = 'block';
                document.getElementById('extension-energyuse-virtual-page').style.display = 'none';
                
                document.getElementById('extension-energyuse-tab-button-overview').classList.add('extension-energyuse-tab-selected'); 
                document.getElementById('extension-energyuse-tab-button-virtual').classList.remove('extension-energyuse-tab-selected'); 
                
                this.show();
            });
            
            document.getElementById('extension-energyuse-tab-button-virtual').addEventListener('click', (event) => {
                document.getElementById('extension-energyuse-overview-page').style.display = 'none';
                document.getElementById('extension-energyuse-virtual-page').style.display = 'block';
                
                document.getElementById('extension-energyuse-tab-button-overview').classList.remove('extension-energyuse-tab-selected'); 
                document.getElementById('extension-energyuse-tab-button-virtual').classList.add('extension-energyuse-tab-selected'); 
                
                this.generate_devices_list();
            });
            
            document.getElementById('extension-energyuse-real-wattage-container').addEventListener('click', (event) => {
                this.show_wattage_details = !this.show_wattage_details;
                this.generate_wattage_details();
            });
            
            document.getElementById('extension-energyuse-total-wattage-container').addEventListener('click', (event) => {
                this.show_wattage_details = !this.show_wattage_details;
                this.generate_wattage_details();
            });
            
            document.getElementById('extension-energyuse-add-virtual-button').addEventListener('click', (event) => {
                document.getElementById('extension-energyuse-add-virtual-button').style.display = 'none';
                setTimeout(() => {
                    document.getElementById('extension-energyuse-add-virtual-button').style.display = 'initial';
                }, 5000);
                
                const virtual_name = document.getElementById('extension-energyuse-add-virtual-name').value;
                const virtual_kwh = document.getElementById('extension-energyuse-add-virtual-kwh').value;
                
                if(virtual_name != "" && virtual_kwh != 0){
        	        window.API.postJson(
        	          `/extensions/${this.id}/api/ajax`,
        				{'action':'add_virtual_device','name':virtual_name,'kwh':virtual_kwh}
        	        ).then((body) => {
                        console.log("add virtual energy measurement device response: ", body);
                        
                        if(body.state == true){
                            document.getElementById('extension-energyuse-add-virtual-name').value = "";
                            document.getElementById('extension-energyuse-add-virtual-watt').value = "";
                            document.getElementById('extension-energyuse-add-virtual-kwh').value = "";
                            
                            document.getElementById('extension-energyuse-add-virtual-succeeded').style.display = 'block';
                            setTimeout(() => {
                                document.getElementById('extension-energyuse-add-virtual-succeeded').style.display = 'none';
                                document.getElementById('extension-energyuse-add-virtual-button').style.display = 'initial';
                            }, 3000);
                            
                        }
                        else{
                            document.getElementById('extension-energyuse-add-virtual-failed').style.display = 'block';
                            setTimeout(() => {
                                document.getElementById('extension-energyuse-add-virtual-failed').style.display = 'none';
                                document.getElementById('extension-energyuse-add-virtual-button').style.display = 'initial';
                            }, 3000);
                        }
                        
                        if(typeof body.virtual != 'undefined'){
                            this.persistent_data.virtual = body.virtual;
                        
                            this.generate_virtual_list();
                        
                            setTimeout(() => {
                                this.generate_virtual_list();
                            }, 100);
                        }
                        
        	        }).catch((e) => {
        	  			console.log("error adding virtual energy measurement device: ", e);
        	        });
                }
                else{
                    document.getElementById('extension-energyuse-add-virtual-failed').style.display = 'block';
                    setTimeout(() => {
                        document.getElementById('extension-energyuse-add-virtual-failed').style.display = 'none';
                        document.getElementById('extension-energyuse-add-virtual-button').style.display = 'initial';
                    }, 3000);
                }
            });
            
            document.getElementById('extension-energyuse-add-virtual-watt').addEventListener('keyup', (event) => {
                console.log("watt value changed: ", event);
                const kwh_from_watt = (document.getElementById('extension-energyuse-add-virtual-watt').value * 24) / 1000;
                console.log("kwh from watt: ", kwh_from_watt);
                document.getElementById('extension-energyuse-add-virtual-kwh').value = Math.round(kwh_from_watt * 10) / 10;
            });
            
            document.getElementById('extension-energyuse-add-virtual-kwh').addEventListener('keyup', (event) => {
                console.log("kwh value changed: ", event);
                const watt_from_kwh = (document.getElementById('extension-energyuse-add-virtual-kwh').value * 1000) / 24;
                console.log("watt_from_kwh: ", watt_from_kwh);
                document.getElementById('extension-energyuse-add-virtual-watt').value = Math.round(watt_from_kwh * 10) / 10;
            });
            
            document.getElementById('extension-energyuse-show-cost-button').addEventListener('click', (event) => {
                console.log("document.getElementById('extension-energyuse-kwh-price').value: ", document.getElementById('extension-energyuse-kwh-price').value);
                
                
                if(document.getElementById('extension-energyuse-overview-page').classList.contains('show-cost') ){
                    document.getElementById('extension-energyuse-show-cost-button').innerText = 'Show cost';
                    document.getElementById('extension-energyuse-overview-page').classList.remove('show-cost');
                }
                else{
                    document.getElementById('extension-energyuse-show-cost-button').innerText = 'Hide cost';
                    document.getElementById('extension-energyuse-overview-page').classList.add('show-cost');
                    
                    if(document.getElementById('extension-energyuse-kwh-price').value != 0 && document.getElementById('extension-energyuse-kwh-price').value != null){
                        if(document.getElementById('extension-energyuse-kwh-price').value != 0 && document.getElementById('extension-energyuse-kwh-price').value != this.current_energy_price){
                            this.current_energy_price = document.getElementById('extension-energyuse-kwh-price').value;
                            this.start();
                        
                            // store the new kwh_price
                	        window.API.postJson(
                	          `/extensions/${this.id}/api/ajax`,
                				{'action':'save_kwh_price','kwh_price':this.current_energy_price}

                	        ).then((body) => {
                                console.log("energy use save_kwh_price response: ", body);
                	        }).catch((e) => {
                	  			console.log("Error saving kwh_price: ", e);
                	        });
                        
                        }
                        else{
                            console.log("kwh price was already that value");
                        }
                    }
                    else{
                        console.log("kwh price was invalid");
                        document.getElementById('extension-energyuse-overview-page').classList.remove('extension-energyuse-show-cost');
                    }
                    
                }
                
            });
            
            
            // Show predictions button
            document.getElementById('extension-energyuse-show-predictions-button').addEventListener('click', (event) => {
                document.getElementById('extension-energyuse-show-predictions-button').style.display = 'none';
                document.getElementById('extension-energyuse-overview-page').classList.add('extension-energyuse-show-predictions');
            });
            

            
            this.interval = setInterval(() =>{
                this.start();
            },1200000); // 1200000 = update the display every 20 minutes
            
            this.start();
            
            // get wattage interval
            this.interval = setInterval(() =>{
                this.get_wattage();
            },10000);
		}   
		
	
        // Get the things, then call get_init_data
        // start -> get_init_data -> renegerate_items
        start(){
            //console.log("in start");
    	    API.getThings()
            .then((things) => {
			
    			this.all_things = things;
                //console.log("energy use: all things: ", this.all_things);
                this.get_init_data();
            
            }).catch((e) => {
		  	    console.log("Energy use: error getting things data: ", e);
		    });
        }
    
    
        
        
        
        //
        //  GET WATTAGE
        //
        // Get data from client-side webthings api about how much energy the devices are using at the moment, and show that value in the big circles.
        // Also creates a dictionary with that data to be used for creating the small table
        get_wattage(){
            if(this.debug){
                //console.log("in get_wattage");
            }
            
            var total_wattage = 0;
            
            const current_timestamp = Math.floor(Date.now() / 1000);
            
            // calculate the total virtual wattage first
            var virtual_wattage = 0;
            for( var id in this.persistent_data.virtual ){
                if(this.debug){
                    console.log("adding virtual wattage: ", this.persistent_data.virtual[id]);
                }
                const virtual = this.persistent_data.virtual[id];
                if(typeof virtual.deleted_time != 'undefined'){
                    if(virtual.deleted_time < current_timestamp){
                        if(this.debug){
                            console.log("This virtual device was deleted by this point, so it will be skipped");
                        }
                        continue;
                    }
                }
                virtual_wattage = virtual_wattage + ((parseFloat(virtual.kwh) * 1000) / 24);
                if(this.debug){
                    console.log("new virtual wattage: ", virtual_wattage);
                }
            }
            
            this.virtual_wattage = virtual_wattage;
            
            try{
    			for (let key in this.all_things){
                    //console.log("WAT KEY: ", key);
                    //console.log(this.all_things[key]);
                    
                    if(this.all_things[key]['href'] == '/things/energyuse'){
                        if(this.debug){
                            console.log("skipping the energy use addon device");
                        }
                        continue;
                    }
                    
                    const device_id = this.get_device_id_from_url( this.all_things[key]['href'] );

                    if( this.all_things[key].hasOwnProperty('properties') ){
                        
                        if(this.debug){
                            //console.log( this.all_things[key]['title'] );
                            //console.log( this.all_things[key]['properties'] );
                        }
                        
                        for (let property_key in this.all_things[key]['properties'] ){
                            
                            if( this.all_things[key]['properties'][property_key].hasOwnProperty('@type') ){
                                //console.log("has title : ", this.all_things[key]['properties'][property_key]['title'].toLowerCase() );
                                if( this.all_things[key]['properties'][property_key]['@type'] == "InstantaneousPowerProperty"){ // .endsWith("/" + device_id) 
                				    if(this.debug){
                                        //console.log("device has InstantaneousPowerProperty");
                                        //console.log('device: ', this.all_things[key]);
                                        //console.log("prop: ", property_key );
                                        //console.log(this.all_things[key]['properties'][property_key]);
                                    }
                                    
                                    var property_href = "";
                                    
                                    if(this.all_things[key]['properties'][property_key].hasOwnProperty('forms')){
                                        if(this.all_things[key]['properties'][property_key]['forms'].length > 0){
                                            if(this.all_things[key]['properties'][property_key]['forms'][0].hasOwnProperty('href')){
                                                property_href = this.all_things[key]['properties'][property_key]['forms'][0]['href'];
                                            }
                                        }
                                        
                                        if(this.debug){
                                            //console.log("power use: property had forms[0]href: ", property_href );
                                        }
                                    }
                                    
                                    if( property_href == "" && this.all_things[key].hasOwnProperty('href') && this.all_things[key]['properties'][property_key].hasOwnProperty('name')){
                                        property_href = this.all_things[key]['href'] + '/properties/' + this.all_things[key]['properties'][property_key]['name'];
                                        if(this.debug){
                                            //console.log("power use: constructed property href: ", property_href );
                                        }
                                    }
                                    
                                    var device_title = 'Unknown';
                                    if(this.all_things[key].hasOwnProperty('title')){
                                        device_title = this.all_things[key]['title'];
                                    }
                                    
                                    if(property_href != ""){
                                        if(this.debug){
                                            //console.log("getting: ", property_href);
                                        }
                                        API.getJson( property_href )
                                        .then((prop) => {
                                            
                                            //if(this.debug){
                                            //    console.log("WATT: ", this.all_things[key]['title'], prop);
                                            //}
                                            const parsed_wattage = parseFloat(prop);
                                            if(typeof( parsed_wattage ) == 'number'){
                                                
                                                if(this.debug){
                                                    //console.log("this.all_things[key]['title']: ", this.all_things[key]['title']);
                                                }
                                                
                                                if(typeof this.device_details[ this.all_things[key]['title'] ] == 'undefined'){
                                                    this.device_details[ this.all_things[key]['title'] ] = {};
                                                    //this.device_details[device_title]['wattages'] = []; // TODO: show small graph?
                                                }
                                                //this.device_details[ this.all_things[key]['title'] ] = {};
                                                this.device_details[ this.all_things[key]['title'] ]['wattage'] = parsed_wattage;
                                                this.device_details[ this.all_things[key]['title'] ]['device_id'] = device_id;
                                                // Skip devices that should be ignored
                                                if(this.persistent_data.ignore.indexOf(device_id) > -1 ){
                                                    this.device_details[ this.all_things[key]['title'] ]['ignore'] = true;
                                                }
                                                else{
                                                    this.device_details[ this.all_things[key]['title'] ]['ignore'] = false;
                                                    total_wattage += parsed_wattage;
                                                }
                                                
                                                if(this.show_wattage_details){
                                                    this.generate_wattage_details();
                                                }
                                                
                                            }
                                            if(total_wattage >= 10){
                                                document.getElementById('extension-energyuse-real-wattage').innerText = Math.round(total_wattage);
                                            }
                                            else{
                                                document.getElementById('extension-energyuse-real-wattage').innerText = this.rounder(total_wattage);
                                            }
                                            
                                            if(this.virtual_wattage + total_wattage >= 10){
                                                document.getElementById('extension-energyuse-total-wattage').innerText = Math.round(this.virtual_wattage + total_wattage);
                                            }
                                            else{
                                                document.getElementById('extension-energyuse-total-wattage').innerText = this.rounder(this.virtual_wattage + total_wattage);
                                            }
                                            
                                        }).catch((e) => {
                                            if(this.debug){
                                                console.error("energy use: get_wattage: error getting wattage from device: ", this.all_things[key]['title'], e);
                                            }
                                        });
                                    }
                                    else{
                                        console.error("WARNING, could not get valid href for instantanious power property: ", this.all_things[key]['properties'][property_key]);
                                    }
                                    
                                    //break; // avoids hypothetical situation with multiple instantenous power properties on one device
                                }
                            }
                        }
                        
                    }
                    else{
                        console.error("Energy use: spotted a thing without properties?");
                    }
                }
            }
            catch(e){
                console.error("Energy Use: get_wattage error: ", e);
            }
        }
        
        
        
        
        
        
        //
        //  GENERATE IGNORE LIST
        //
        // Allow the user to skip over some devices when calculating the total energy use
        generate_devices_list(){
            if(this.debug){
                console.log("in generate_devices_list (ignored devices). this.device_details: ", this.device_details );
            }
            
            let ignore_list_el = document.getElementById('extension-energyuse-devices-list');
            ignore_list_el.innerHTML = "";
            //ignore_list_el.style.display = 'block';
            
            //if(this.persistent_data.ignore.indexOf(device_id) > -1 ){}
            //
            
            // Get the real devices
            var keys = Object.keys(this.device_details);
            //console.log('keys: ', keys);
            keys.sort(); 
            for(let w = 0; w < keys.length; w++){
                const title = keys[w];
                //console.log('title: ', title);
                const device_el = document.createElement('div');
                device_el.classList.add('extension-energyuse-devices-list-item');
            
                //device_el.innerHTML = '<span class="extension-energyuse-devices-list-title">' + title + '</span><span class="extension-energyuse-wattage-device-value">' + this.device_details[title].wattage + '</span>';
            
                
            
                // Add device title
                const title_el = document.createElement('span');
                title_el.classList.add('extension-energyuse-devices-list-title');
                title_el.innerText = title;
                device_el.appendChild(title_el);
            
                // Add ignore checkbox
                const ignore_checkbox_el = document.createElement('input');
                ignore_checkbox_el.classList.add('extension-energyuse-devices-list-ignore-checkbox');
                ignore_checkbox_el.type = "checkbox";
                ignore_checkbox_el.name = "extension-energyuse-devices-list-" + this.device_details[title].device_id;
                //ignore_checkbox_el.value = "value";
                ignore_checkbox_el.id = "extension-energyuse-devices-list-" + this.device_details[title].device_id;
                if(this.persistent_data.ignore.indexOf( this.device_details[title].device_id ) > -1 ){
                    ignore_checkbox_el.checked = true;
                }
                
                ignore_checkbox_el.addEventListener('change', (event) => {
                    console.log("checkbox changed. Device_id: ", this.device_details[title].device_id, ignore_checkbox_el.checked);
                    
        	        window.API.postJson(
        	          `/extensions/${this.id}/api/ajax`,
        				{'action':'ignore','choice':ignore_checkbox_el.checked,'device_id':this.device_details[title].device_id}
        	        ).then((body) => {
                        if(this.debug){
                            console.log("Changed device ignore state. response: ", body);
                        }
                        //if(body.state == true){    
                        //}
                    
                        this.persistent_data.ignore = body.ignore;
                    
                        if(body.state == false){
                            setTimeout(() => {
                                this.generate_devices_list();
                            }, 100);
                        }
                        
                    
        	        }).catch((e) => {
        	  			console.log("error deleting virtual energy measurement device: ", e);
        	        });
                    
                });
                
                device_el.appendChild(ignore_checkbox_el);
            
                ignore_list_el.appendChild(device_el);
            }
            
        }
        
        
        
        //
        //  GENERATE WATTAGE DETAILS
        //
        // Show live power consumption in a small table. Assumes this.device_details has already been created
        generate_wattage_details(){
            if(this.debug){
                console.log("in generate_wattage_details");
            }
            
            let wattage_details_el = document.getElementById('extension-energyuse-wattage-details');
            wattage_details_el.innerHTML = "";
            wattage_details_el.style.display = 'block';
            
            //let combined_wattage = 0;
            const current_timestamp = Math.floor(Date.now() / 1000);
            
            if(this.show_wattage_details){
                
                
                // Get the real devices wattage
                var keys = Object.keys(this.device_details);
                //console.log('keys: ', keys);
                keys.sort(); 
                for(let w = 0; w < keys.length; w++){
                    const title = keys[w];
                    //console.log('title: ', title);
                    const device_el = document.createElement('div');
                    device_el.classList.add('extension-energyuse-wattage-device');
                
                    var ignore_class = "";
                    if(this.device_details[title].ignore){
                        ignore_class = " ignore ";
                        device_el.classList.add('extension-energyuse-wattage-device-ignored');
                    }
                
                    device_el.innerHTML = '<span class="extension-energyuse-wattage-device-title">' + title + '</span><span class="extension-energyuse-wattage-device-value">' + this.device_details[title].wattage + '</span>';
                
                    wattage_details_el.appendChild(device_el);
                }
                
                // Get the virtual devices wattage
                for( var id in this.persistent_data.virtual ){
                    if(this.debug){
                        console.log("adding virtual wattage: ", this.persistent_data.virtual[id]);
                    }
                    
                    
                    // virtual item data
                    const virtual = this.persistent_data.virtual[id];
                    
                    if(typeof virtual.deleted_time != 'undefined'){
                        if(virtual.deleted_time < current_timestamp){
                            if(this.debug){
                                console.log("This virtual device was deleted by this point, so it will be skipped");
                            }
                            continue;
                        }
                    }
                    
                    var device_el = document.createElement('div');
                    device_el.classList.add('extension-energyuse-wattage-device-virtual');
                    device_el.innerHTML = '<span class="extension-energyuse-wattage-device-title">' + virtual.name + '</span><span class="extension-energyuse-wattage-device-value">' + this.rounder((parseFloat(virtual.kwh) * 1000) / 24) + '</span>';
                    
                    wattage_details_el.appendChild(device_el);
                    
                }
                
            }
            
        }
        
        
        // Get the data stored by the addon
        get_init_data(){
            //console.log('in get_init_data');
			try{
				
                const jwt = localStorage.getItem('jwt');
                
		  		// Init
		        window.API.postJson(
		          `/extensions/${this.id}/api/ajax`,
                    {'action':'init', 'jwt':jwt}

		        ).then((body) => {
					
                    
                    if(typeof body.debug != 'undefined'){
                        if(body.debug){
                            this.debug = body.debug;
                            document.getElementById('extension-energyuse-debug-warning').style.display = 'block';
        					console.log("Energy use init API result: ", body);
                        }
                    }
                    
                    
                    if(typeof body.persistent == 'undefined'){
                        console.error("ERROR: energy use: init response: persistent data was undefined!");
                        return;
                    }
                    
                    this.persistent_data = body.persistent;
                    if(typeof this.persistent_data['device_detail_days'] != 'undefined'){
                        this.device_detail_days = parseInt(this.persistent_data['device_detail_days']);
                        //console.log("device_detail_days is set to: " + this.persistent_data['device_detail_days']);
                    }
                    
                    if(this.persistent_data.token == null || this.persistent_data.token == ''){
                        //console.log('no token present yet');
                        document.getElementById('extension-energyuse-missing-token').style.display = 'block';
                    }
                    
                    
                    
                    
                    if(typeof body.last_hour_time != 'undefined'){
                        this.last_hour_time = body.last_hour_time;
                        if(this.debug){
                            console.log("energy use: last_hour_time: ", this.last_hour_time);
                        }
                    }
                    
                    
                    if(typeof this.persistent_data.grand_total != 'undefined'){
                        //document.getElementById('extension-energyuse-totals').style.display = 'block';
                        if(this.persistent_data.grand_total != 0){
                            document.getElementById('extension-energyuse-grand-total').innerText = this.rounder(this.persistent_data.grand_total);
                        }
                    }
                    
                    
                    
                    
                    
                    if(typeof this.persistent_data.hide_cost != 'undefined'){
                        if(this.persistent_data.hide_cost == true){
                            this.showing_cost = false;
                            if(this.debug){
                                console.log("energy use: not displaying cost option");
                            }
                        }
                        else{
                            document.getElementById('extension-energyuse-options').style.display = 'flex';
                        }
                    }
                    
                    if(typeof this.persistent_data.kwh_price != 'undefined'){
                        this.current_energy_price = this.persistent_data.kwh_price;
                        document.getElementById('extension-energyuse-kwh-price').value = this.current_energy_price;
                    }
                    
                    
                    if(typeof this.persistent_data.energy != 'undefined'){
                        this.regenerate_items(this.persistent_data.energy);
                    }
                    
                    this.get_wattage();
				
                    if(typeof this.persistent_data.ignore != 'undefined'){
                        this.generate_devices_list();
                    }
                
                
                    if(typeof this.persistent_data.virtual != 'undefined'){
                        this.generate_virtual_list();
                    }
                    
                    
                    //console.log("this.persistent_data.previous_hour_day_delta: ", this.persistent_data.previous_hour_day_delta);
                    if(typeof this.persistent_data.previous_hour_day_delta != 'undefined'){
                        //document.getElementById('extension-energyuse-today-so-far').innerText = this.rounder(this.persistent_data.previous_hour_day_delta,true); // true means: return zero if the value is zero
                        
                        var today_so_far_html = '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(this.persistent_data.previous_hour_day_delta,true) + '</span>'; // here the actual kwh value gets added to the html output
            
                        if(this.showing_cost && this.current_energy_price != null){
                            today_so_far_html += '<span class="extension-energyuse-cost">' + this.rounder( this.persistent_data.previous_hour_day_delta * this.current_energy_price, true ) + '</span>';
                        }
                        
                        document.getElementById('extension-energyuse-today-so-far').innerHTML = today_so_far_html;
                        
                    }
                    else{
                        document.getElementById('extension-energyuse-today-so-far').innerText = '?';
                    }
                    
                
		        }).catch((e) => {
		  			console.log("Error getting Energyuse init data: ", e);
		        });	

				
			}
			catch(e){
				console.log("Error in get_init_data: ", e);
			}
        }
    
    
    
    
        //
        // GENERATE VIRTUAL DEVICES LIST
        //
        // Used on the virtual devices tab to list the virtual devices
        generate_virtual_list(){
            try{
                
                const virtual_list_el = document.getElementById('extension-energyuse-virtual-list');
                virtual_list_el.innerHTML = "";
                
                var at_least_one_existed = false;
                
                for( var id in this.persistent_data.virtual ){
                    
                    
                    // virtual item data
                    const virtual = this.persistent_data.virtual[id];
                    if(this.debug){
                        console.log("virtual: ", virtual);
                    }
                    if(typeof virtual['deleted_time'] != 'undefined'){
                        continue;
                    }
                
                    at_least_one_existed = true;
                
                    // create virtual item container element
                    var virtual_item_el = document.createElement('div');
                    virtual_item_el.classList.add('extension-energyuse-virtual-item');
                    
                    // create html within item
                    //console.log("virtual.name: ", virtual.name);
                    var virtual_name_el = document.createElement('div');
                    virtual_name_el.classList.add('extension-energyuse-virtual-item-name');
                    virtual_name_el.innerText = virtual.name;
                    
                    var virtual_kwh_el = document.createElement('div');
                    virtual_kwh_el.classList.add('extension-energyuse-virtual-item-kwh');
                    virtual_kwh_el.innerText = virtual.kwh;
                    
                    
                    // Virtual item delete button
                    var virtual_del_el = document.createElement('button');
                    virtual_del_el.classList.add('extension-energyuse-virtual-item-delete');
                    virtual_del_el.classList.add('text-button');
                    virtual_del_el.innerText = 'Remove';
                    
                    virtual_del_el.addEventListener('click', (event) => {
                        if(this.debug){
                            console.log("clicked on virtual item delete button. name: ", virtual.name);
                        }
                        
            	        window.API.postJson(
            	          `/extensions/${this.id}/api/ajax`,
            				{'action':'delete_virtual_device','name':virtual.name}
            	        ).then((body) => {
                            if(this.debug){
                                console.log("delete virtual energy measurement device response: ", body);
                            }
                            //if(body.state == true){    
                            //}
                        
                            this.persistent_data.virtual = body.virtual;
                        
                            setTimeout(() => {
                                this.generate_virtual_list();
                            }, 100);
                        
            	        }).catch((e) => {
            	  			console.log("error deleting virtual energy measurement device: ", e);
            	        });
                        
                        
                    });
                    
                    // Add to item
                    virtual_item_el.appendChild(virtual_name_el);
                    virtual_item_el.appendChild(virtual_kwh_el);
                    virtual_item_el.appendChild(virtual_del_el);
                
                    // Add item to view
                    virtual_list_el.appendChild(virtual_item_el);
                
                }
                
                if( at_least_one_existed == false){
                    virtual_list_el.innerHTML = "There are no virtual devices yet";
                    document.getElementById('extension-energyuse-content').classList.remove('extension-energyuse-has-virtual');
                }
                else{
                    document.getElementById('extension-energyuse-content').classList.add('extension-energyuse-has-virtual');
                }
                
            }
            catch(e){
                console.error("energy use: error in generate_virtual_list: ", e);
            }
            
            
        }
    
    
    
    
    
    
    
	
		//
		//  REGENERATE ENERGY USE OVERVIEW
		//
	    // Takes all the data and turns it into weekly chunks of data to be displayed
		regenerate_items(items, page){
			try {
				if(this.debug){
                    console.log("regenerating. items: ", items);
                }
		        
                /*
                if(this.show_cost){
                    document.getElementById('extension-energyuse-overview-page').classList.add('show-cost');
                }
                else{
                    document.getElementById('extension-energyuse-overview-page').classList.remove('show-cost');
                }
                */
        
				const pre = document.getElementById('extension-energyuse-response-data');
				
				const original = document.getElementById('extension-energyuse-original-item');
			    //console.log("original: ", original);
                
                if(typeof items == 'undefined'){
                    items = this.persistent_data.energy;
                }
				//items.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase()) ? 1 : -1) // sort alphabetically
				
                var list = document.getElementById('extension-energyuse-list');
                
                
                var previous_date = new Date(0);
                var previous_timestamp = 0;
                //console.log('previous date at the beginning: ', previous_date );
                
                const total_items_count = Object.keys(items).length;
                
                if(total_items_count == 0){
                    list.innerHTML = "<h1>There is no data (yet)</h1>";
                    document.getElementById('extension-energyuse-devices-tip').style.display = 'block';
                }
                else{
                    list.innerHTML = "";
                }
                
                                
                var previous_value = {}
                
                var ready_clone = null;
                
                var items_counter = 0;
                
                var showing_device_details = false;
                //console.log('items:', items);
                //console.log("items count: ", total_items_count);
                
                
                var week_container = document.createElement('div')
                week_container.setAttribute("class", "extension-energyuse-week-container");
				
                var day_total = 0;
                var week_total_kwh = 0;
                var previous_week_total_kwh = 0;
                var previous_device_count = null;
                var device_count = 0; // if any new devices show up during the week, this will change
                
                var first_date_of_week = null;
                var last_date_of_week = null;
                var last_week_start_epoch = null;
                var week_start_date_string = null;
                
                var previous_day_number = 8; // this will cause a week_container to be immediately made
                
                var week_data = [];
                var week_devices = {};
                var week_devices = {'start_timestamp':timestamp};
                var week_available_day_number = 0;
                
                
                var previous_timestamp = null;
                
                const current_timestamp = Math.round(Date.now() / 1000);
                const details_threshold_timestamp = current_timestamp - (this.device_detail_days * 86400);
                //console.log("details_threshold_timestamp: ", details_threshold_timestamp);
                var details_threshold_date = new Date((details_threshold_timestamp - 600) * 1000);
                
                
                // Loop over all items
				for( var timestamp in items ){
                    
                    // Get the date
                    var date = new Date((timestamp - 600) * 1000); // make sure the timestamp is in the day before
                    
                    if(this.debug){
                        console.log("\n\n.");
                        console.log("TIMESTAMP: " + timestamp);
                        console.log("DATE     : ", date);
                        console.log("(previous_timestamp: ", previous_timestamp);
                    }
					var clone = original.cloneNode(true);
					clone.removeAttribute('id');
                    
                    var first_week_day = false;
                    
                    if(last_week_start_epoch = null){
                        last_week_start_epoch = timestamp;
                    }
                    
                    // Figure out when the week ends/starts
                    var should_create_new_week = false;
                    if(previous_timestamp != null){
                        //console.log("last_week_start_epoch was not null");
                        if(timestamp - previous_timestamp > 604800){ // 618800000){ // at least a week has passed. Maybe the addon was disabled for a while.
                            if(this.debug){
                                console.log("\n\n\n\n\nZZZZ\n\n\n\n\nwhoa, at least a week has passed since the last timestamp");
                            }
                            should_create_new_week = true;
                            //week_available_day_number = 0;
                        
                            this.add_week(week_devices,showing_device_details);
                        
                            first_week_day = true;
                        
                            week_devices = {'start_timestamp':timestamp};
                            week_available_day_number = 1; // does not start at 0
                            
                        }
                    }
                    
                    
                    
                    if(timestamp > details_threshold_timestamp){
                        if(this.debug){
                            //console.log("\nsetting showing_device_details to TRUE <---------------------------------------------\n");
                        }
                        showing_device_details = true;
                    }
                    
                    
                   
                    //console.log("date in day before: ", date);
                    
                    if(week_start_date_string == null){
                        week_start_date_string = "" + date.getDate()+"/"+(date.getMonth()+1);
                    }
                    
                    const current_day_number = date.getDay();
                    
                    //if( current_day_number != this.previous_day_number){
                    if(date.getDate() != previous_date.getDate()){ // && date.getMonth() != previous_date.getMonth()){
                        //console.log("it's a new date");
                    
                        
                        previous_date = date; // date objects
                        
                        
                        
                        //console.log("new day");
                        week_available_day_number++; // may be less than 7 is there is only data for, say, 4 days in this week.
                        
                        if( current_day_number < this.previous_day_number){
                            if(this.debug){
                                console.log("WRAP AROUND. Week_devices: ", week_devices);
                            }
                            this.add_week(week_devices,showing_device_details);
                            
                            first_week_day = true;
                            
                            week_devices = {'start_timestamp':timestamp};
                            week_available_day_number = 1; // does not start at 0
                            
                            /*
                            for (var prop in week_devices) {
                                if (week_deviceshasOwnProperty(prop)) {
                                    delete week_devices[prop];
                                }
                            }
                            */
                        }
                        
                        this.previous_day_number = current_day_number
                        //console.log("NEW DAY OK");
                        //console.log("device_count: " + device_count);
                        //console.log("previous_device_count: " + previous_device_count);
                        
                        if(previous_device_count == null){
                            previous_device_count = device_count;
                        }
                    
                        if(device_count != previous_device_count){
                            ready_clone.classList.add("extension-energyuse-item-show-device-names");
                        }
                        previous_device_count = device_count;
                        
                        
                        if(ready_clone != null && this.only_show_week_total == false){
                            week_container.append(ready_clone)
                        }
                        week_total_kwh = week_total_kwh + day_total;
                        
                        
                        if(first_week_day){
                            //console.log('first week day');
                            last_week_start_epoch = timestamp;
                            
                            const this_week_total_kwh = week_total_kwh - previous_week_total_kwh;
                            
                            // TODO: could indicate if energy use increased or decreased compared to last week, e.g. with a percentage
                            var week_total_el = document.createElement('div');
                            week_total_el.setAttribute("class", "extension-energyuse-week-total");
                            week_total_el.innerHTML = '<span class="extension-energyuse-week-total-start-date">' + week_start_date_string + '</span><span class="extension-energyuse-week-total-kwh">' + this.rounder(this_week_total_kwh) + '<pan>';
                            week_container.append(week_total_el);
                            
                            // Create start date string for next week's total
                            week_start_date_string = "" + date.getDate()+"/"+(date.getMonth()+1);
                            
                            // Remember the total up to this week.
                            previous_week_total_kwh = week_total_kwh;
                            
                            
                            //list.prepend(week_container);
                            week_container = document.createElement('div');
                            week_container.setAttribute("class", "extension-energyuse-week-container");
                            
                        }
                        
                    }
                    //else{
                        //console.log("spotted new data for the same day as the previous day");
                    //}
                    
                    const day_names = ['sun','mon','tue','wed','thu','fri','sat'];
                    
                    let date_string = '<span class="extension-energyuse-date-number">' + date.getDate() + '</span><span class="extension-energyuse-date-spacer">/</span><span class="extension-energyuse-month-number">' + (date.getMonth()+1) + '</span>';
                    clone.getElementsByClassName("extension-energyuse-item-date")[0].innerHTML = '<span class="extension-energyuse-item-day-name">' + day_names[current_day_number] + '</span><span class="extension-energyuse-item-date">' + date.getDate()+"/"+(date.getMonth()+1 + '</span>');
                    
                    
                    const day = items[timestamp];
                    //console.log('day raw: ', day);
                    
                    day_total = 0;
                    device_count = 0;
                    
                    
                    
                    
                    
                    // VIRTUAL
                    
                    if(typeof day['virt'] != 'undefined'){
                        //console.log("VIRT SPOTTED IN DAY");
                        
                        for( var id in this.persistent_data.virtual ){
                            
                            const virtual = this.persistent_data.virtual[id];
                            const virtual_device_id = 'virtual-' + virtual.name;
                            if(this.debug){
                                console.log("checking virtual device: ", virtual_device_id, virtual);
                            }
                            
                            // TODO? It would be possible to remove the device's "old data" as well by setting the deleted_time to 0. Could be a user option.
                            if(typeof virtual.deleted_time != 'undefined'){
                                if(virtual.deleted_time < timestamp){
                                    if(this.debug){
                                        console.log("This virtual device was deleted by this point, so it will be skipped");
                                    }
                                    continue;
                                }
                            }
                            //console.log("timestamps: ", virtual.created_time, timestamp);
                            //console.log("timestamps dif: ", timestamp - virtual.created_time);
                            
                            if(virtual.created_time < timestamp){
                                //week_devices['week_available_days']
                                if(this.debug){
                                    console.log("virtual device was active on this date");
                                }
                                if(typeof week_devices[virtual_device_id] == 'undefined'){
                                    week_devices[virtual_device_id] = {'device_id':'virtual-' + virtual.name, 'title':virtual.name, 'was_used':true, 'virtual':true, 'days':[] };
                                }
                                week_devices[virtual_device_id]['days'].push( {'week_available_day_number':week_available_day_number,'day_name':day_names[current_day_number], 'date':date_string, 'absolute':-1, 'relative':virtual.kwh} );
                            }
                            else{
                                if(this.debug){
                                    console.log("virtual device was NOT active on this date");
                                }
                            }
                            
                            
                        }
                        
                    }
                    
                    
                    
                    for (const device_id in day) {
                        if (day.hasOwnProperty(device_id)) {
                            //console.log(" -- device_id: ", device_id);
                            if(device_id == 'virt'){
                                //console.log("skipping virt in day");
                                continue;
                            }
                            
                            const title = this.get_title(device_id);
                            //console.log(" -- device title: ", title);
                            
                            var prev_value = day[device_id];
                            var current_value = day[device_id];
                            var delta = 0;
                            
                            
                            
                            if(typeof previous_value[device_id] != 'undefined'){
                                prev_value = previous_value[device_id];
                                delta = current_value - prev_value;
                                
                                if(typeof week_devices[device_id] == 'undefined'){
                                    week_devices[device_id] = {'device_id':device_id, 'title':title, 'was_used':false, 'virtual':false, 'days':[] }; // 'week_available_days':week_available_day_number,
                                }
                                
                                if(delta != 0){
                                    week_devices[device_id]['was_used'] = true;
                                    if(week_available_day_number > week_devices['week_available_days']){
                                        week_devices['week_available_days'] = week_available_day_number; // keep track of the maximum number of available days in this week
                                    }
                                    
                                    // Also store this per-device. Why not.
                                    week_devices[device_id]['week_available_days'] = week_available_day_number;
                                    
                                }
                                
                                week_devices[device_id]['days'].push( {'week_available_day_number':week_available_day_number,'day_name':day_names[current_day_number], 'date':date_string, 'absolute':current_value, 'relative':delta} );
                                
                                
                                
                                //week_devices[device_id] = {'device_id':device_id, 'title':title  ,'week_available_day_number':week_available_day_number, 'absolute':current_value, 'relative':delta};
                                //console.log("week_devices: ", week_devices);
                            }
                            
                            
                            
                            previous_value[device_id] = day[device_id]; // remember what the value was today, so the difference with the next day can be calculated
                            
                            day_total += delta;
                            
        					var devel = document.createElement("div");
        					devel.setAttribute("class", "extension-energyuse-item-stack-device");
                            var a_el = document.createElement("a");
                            a_el.href = '/things/' + device_id;
                            //const title = this.get_title(device_id);
                            
                            //var title_span = document.createElement("span");
                            var title_t = document.createTextNode(title);
                            a_el.appendChild(title_t);
                            
                            var kwh_span = document.createElement("span");
        					var kwh_t = document.createTextNode(this.rounder(delta)); //   + "KWh"
                            kwh_span.appendChild(kwh_t);
                            
                            devel.appendChild(a_el);
                            devel.appendChild(kwh_span);
                            
                            /*
                            // To protect privacy, only show device details if the date is less than X days away from today (maximum 12 weeks)
                            if( (items_counter + this.device_detail_days) > total_items_count){
                                clone.getElementsByClassName("extension-energyuse-item-stack")[0].appendChild(devel)
                                device_count++;
                                if(!showing_device_details){
                                    showing_device_details = true;
                                    //console.log('showing device details from now on ');
                                    clone.classList.add("extension-energyuse-item-show-device-names");
                                }
                            }
                            */
                        }
                    }
                    
                    clone.getElementsByClassName("extension-energyuse-item-total")[0].innerHTML = day_total.toFixed(2); // + "KWh";
                    
                    
                    
                    
                    items_counter++;
                    
                    //console.log("items_counter: ", items_counter);
                    
                    if(items_counter == total_items_count){
                        if(this.debug){
                            console.log("energy use: arrived at last day recorded (likely yesterday)");
                        }
                        this.add_week(week_devices,showing_device_details);
                        
                        week_total_kwh = week_total_kwh + day_total;
                        const this_week_total_kwh = week_total_kwh - previous_week_total_kwh;
                        
                        clone.classList.add("extension-energyuse-item-today");
                        week_container.append(clone);
                        
                        var week_total_el = document.createElement('div');
                        week_total_el.setAttribute("class", "extension-energyuse-week-total");
                        week_total_el.innerHTML = '<span class="extension-energyuse-week-total-start-date">' + week_start_date_string + '</span><span class="extension-energyuse-week-total-kwh">' + this.rounder(this_week_total_kwh) + '<pan>';
                        week_container.append(week_total_el);
                        
                        //list.prepend(week_container);
                    }
                    else{
                        //console.log("setting clone to ready_clone");
                        ready_clone = clone; // Remember the element for now. It's only pasted into the list if we're sure the next item isn't for the same day. In that case this clone should be dropped.
                    }
                    
                    previous_timestamp = timestamp;
                    
				} // end of looping over all days
			    
			}
			catch (e) {
				console.log("Error in regenerate_items: ", e);
			}
		}
    
        
        
        
        //
        //  ADD WEEK
        //
        // Turns week data into HTML and adds it to the page
        add_week(week, showing_device_details){
            try{
                if(this.debug){
                    console.log("energy use: IN ADD WEEK", week);
                }
                let at_least_one_device_was_used = false;
            
                let header_html = "";
                let footer_html = "";
            
                let day_kwh_totals = new Array(0,0,0,0,0,0,0,0); // total energy use per day
                let date_strings = new Array('8');
                let week_total = 0;
            
                let week_el = document.createElement('div');
                week_el.setAttribute("class", "extension-energyuse-week-container");
            
                let output = "";
            
                let days_in_the_week = 0; // how many days of data does this week have? Ideally 7, but in it might be less (e.g. in the current week, or with sporadic device use).
            
                if(typeof week.start_timestamp == 'undefined'){
                    if(this.debug){
                        console.warn('energyuse: week data had no start timestamp: ', week);
                    }
                }
                
                var week_device_titles = [];
                try{
                    for (const device_id in week) {
                        //console.log("device_id: ", device_id);
                        //console.log("week: ", week);
                        //console.log("week[device_id]: ", week[device_id]);
                        if(typeof week[device_id]['title'] != 'undefined'){
                            week_device_titles.push(week[device_id]['title']);
                        }
                        else{
                            console.warn("energy use: add_week: missing thing title: ", week[device_id]);
                        }
                    }
                }
                catch(e){
                    if(this.debug){
                        console.log("energyuse: error getting device titles: ", e);
                    }
                }
                
                
                
                
                //week_device_titles.sort();
                //week_device_titles.sort(String.CASE_INSENSITIVE_ORDER);
                week_device_titles = week_device_titles.sort((a, b) => {
                  return a.localeCompare(b, undefined, {sensitivity: 'base'});
                });
                
                
                if(this.debug){
                    //console.log('sorted week_keys: ', week_device_titles);
                }
                for (const sorted_device_title in week_device_titles) {
                    //console.log("sorted_device_title: ", week_device_titles[sorted_device_title]);
                    
                    for (const device_id in week) {
                        //console.log("device_id in week: ", device_id);
                        //console.log("week[device_id]['title']: ", week[device_id]['title']);
                        
                        if(week[device_id]['title'] == week_device_titles[sorted_device_title]){
                            //console.log("BINGO");
                            //let device_id = week_keys[w];
                            //console.log(device_id);
                
                            let device = week[device_id];
                
                            if(this.debug){
                                //console.log("device: ", device_id);
                            }
                            //console.log("device-> was_used: ", device['was_used']);
                
                            if(device['was_used'] == true){
                    
                                at_least_one_device_was_used = true;
                    
                                var ignored_class = "";
                                if(this.persistent_data.ignore.indexOf(device_id) > -1 ){
                                    ignored_class = " extension-energyuse-device-ignored";
                                }
                                
                    
                                //let device_id = device['device_id'];
                                //console.log("device_id: " + device_id);
                                if(showing_device_details){
                                    if(week[device_id]['virtual'] == true){
                                        output += '<tr class="extension-energyuse-device-tr extension-energyuse-device-tr-virtual' + ignored_class + '">';
                                        output += '<td class="extension-energyuse-device-title">' + device['title'] + '</td>';
                                    }
                                    else{
                                        output += '<tr class="extension-energyuse-device-tr' + ignored_class + '">';
                                        output += '<td class="extension-energyuse-device-title"><a href="/things/' + device_id + '">' + device['title'] + '</a></td>';
                                    }
                                    
                                }
                    
                                let device_kwh_total = 0;
                    
                                let start_kwh = null;
                                let end_kwh = null;
                    
                                let days_used = 0;
                    
                    
                                for(let d = 1; d < 8; d++){
                    
                                    let was_used_today = false;
                                    let today_data = {};
                        
                                    if(showing_device_details){
                                        output += '<td class="extension-energyuse-device-day-use">';
                                    }
                                    for(let e = 0; e < device['days'].length; e++){
                            
                                        if(e == 0 && start_kwh == null){
                                            start_kwh = device['days'][e]['absolute'];
                                        }
                                        if(e == device['days'].length-1 && end_kwh == null){
                                            end_kwh = device['days'][e]['absolute'];
                                        }
                            
                                        if(d == device['days'][e]['week_available_day_number']){
                                            was_used_today = true;
                                            today_data = device['days'][e];
                                            break;
                                        }
                                    }
                        
                                    if(was_used_today){
                                        days_used++;
                                        
                                        if(days_used > days_in_the_week){
                                            days_in_the_week = days_used; // count the total number of days that this week has data for
                                        }
                            
                                        if(days_used > 7){
                                            console.error("energyuse: add_week: more than 7 days in the week?")
                                        }
                            
                                        if(this.debug){
                                            //console.log(device['title'] + " was used today. Day data:", today_data);
                                        }
                                        
                                        device_kwh_total = device_kwh_total + today_data['relative'];
                                        
                                        if(this.debug){
                                            //console.log("device_kwh_total by relative addition: ", device_kwh_total);
                                        }
                            
                                        if(showing_device_details){
                                            output += '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(today_data['relative']) + '</span>'; // here the actual kwh value gets added to the html output
                                
                                            if(this.showing_cost && this.current_energy_price != null){
                                                output += '<span class="extension-energyuse-cost">' + this.rounder( today_data['relative'] * this.current_energy_price ) + '</span>';
                                            }
                                        }
                            
                            
                            
                            
                            
                                        date_strings[d] = '<span class="th-day-name">' + today_data['day_name'] + '</span><br/><span class="th-day-date">' + today_data['date'] + '</span>';
                            
                                        //device_kwh_total = device_kwh_total + today_data['relative'];
                                        
                                        // If the device is not being ignored, then add its day value
                                        if(this.persistent_data.ignore.indexOf(device_id) == -1 ){
                                            day_kwh_totals[d] = day_kwh_totals[d] + today_data['relative'];
                                        }
                                        //console.log("day_kwh_totals[d]: ", day_kwh_totals[d] );
                                        //console.log("day_kwh_totals: ", day_kwh_totals );
                            
                                    }
                        
                                    if(showing_device_details){
                                        output += '</td>';
                                    }
                        
                        
                                }
                    
                                //console.log(device['title'] + " start and end kwh: ", start_kwh, end_kwh);
                    
                                /*
                                let device_total = null;
                                if(start_kwh != null && end_kwh != null){
                                    device_total = end_kwh - start_kwh;  
                                }
                                */
                                
                                // Do not add energy use of an ignored device to the weekly totals
                                if(this.persistent_data.ignore.indexOf(device_id) == -1 ){
                                    week_total = week_total + device_kwh_total;
                                }
                    
                    
                                if(showing_device_details){
                                    output += '<td class="extension-energyuse-device-total extension-energyuse-column-total">';
                                    output += '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(device_kwh_total) + '</span>';
                        
                                    if(this.showing_cost && this.current_energy_price != null){
                                        output += '<span class="extension-energyuse-cost">' + this.rounder( device_kwh_total * this.current_energy_price ) + '</span>';
                                    }
                        
                                    // Yearly extrapolation
                                    //const average_per_day = week_total / days_used;
                                    //const yearly_kwh_prediction = average_per_day * 365;
                                    const yearly_kwh_prediction = device_kwh_total * 52.17857;
                                    //console.log("average kwh per day: ", average_per_day);
                                    //console.log("yearly_kwh_prediction: ", yearly_kwh_prediction);
                        
                        
                                    output += '<td class="extension-energyuse-device-yearly extension-energyuse-column-yearly">';
                                    output += '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(yearly_kwh_prediction) + '</span>';
                        
                                    if(this.showing_cost && this.current_energy_price != null){
                                        output += '<span class="extension-energyuse-cost">' + this.rounder( yearly_kwh_prediction * this.current_energy_price ) + '</span>';
                                    }
                        
                                    output += '</td>';
                                    output += '<tr>';
                                }
                    
                            }
                            else{
                                if(this.debug){
                                    //console.log("skipping device that was not used this week: ", device['title']);
                                }
                            }
                            
                        }
                    }
                }
            
                // wrap header and footer around output
                if(at_least_one_device_was_used){
                    if(this.debug){
                        console.log("at least one device was used.");
                    }
                
                    // add header
                    header_html += '<tr class="extension-energyuse-th"><th class="extension-energyuse-device-title">';
                    if(showing_device_details){
                        header_html += 'Device';
                    }
                    header_html += '</th>';
                
                    for(let d = 1; d < 8; d++){
                        header_html += '<th class="extension-energyuse-th-day-' + d + '">';
                        if(typeof date_strings[d] != 'undefined'){
                            header_html += date_strings[d];
                        }
                        header_html += '</th>';
                    }
                    header_html += '<th class="extension-energyuse-device-total extension-energyuse-column-total">Week</th>';
                    header_html += '<th class="extension-energyuse-device-yearly extension-energyuse-column-yearly"><span title="This is an extrapolation based on this week">Yearly</span></th>';
                
                    header_html += '</tr>';
                    //console.log("header_html: " , header_html);
                    output = header_html + output;
                
                
                    // add footer
                    footer_html += '<tr class="extension-energyuse-sums"><td class="extension-energyuse-nothing"></td>';
                    for(let d = 1; d < 8; d++){
                        footer_html += '<td class="extension-energyuse-day-sum-' + d + '">';
                        if(day_kwh_totals[d] > 0){
                            footer_html += '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(day_kwh_totals[d]) + '</span>';
                            if(this.showing_cost && this.current_energy_price != null){
                                footer_html += '<span class="extension-energyuse-cost">' + this.rounder( day_kwh_totals[d] * this.current_energy_price ) + '</span>';
                            }
                        }
                        footer_html +='</td>';
                    }
                
                    // Add weekly total column
                    footer_html += '<td class="extension-energyuse-week-total extension-energyuse-column-total">';
                    footer_html += '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(week_total) + '</span>';
                    if(this.showing_cost && this.current_energy_price != null){
                        footer_html += '<span class="extension-energyuse-cost">' + this.rounder( week_total * this.current_energy_price ) + '</span>';
                    }
                    footer_html += '</td>';
                
                    // Add yearly extrapolation column. Not currently used, could be confusing/overwhelming.
                    footer_html += '<td class="extension-energyuse-yearly-total extension-energyuse-column-yearly">';
                    /*
                    footer_html += '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(yearly_total) + '</span>';
                    if(this.showing_cost && this.current_energy_price != null){
                        footer_html += '<span class="extension-energyuse-cost">' + this.rounder( yearly_total * this.current_energy_price ) + '</span>';
                    }
                    */
                    footer_html += '</td>';
                
                    footer_html += '</tr>';
                
                
                
                    //console.log("footer_html: " , footer_html);
                
                    output += footer_html;
                
                }
                else{
                    //console.log("No devices used any power?");
                    output += "<tr><td></td></tr>";
                }
            
                
                output = '<table>' + output + '</table>';
            
                week_el.innerHTML = output;
                
                if(showing_device_details){
                    week_el.classList.add('extension-energyuse-week-has-device-details');
                }
                else{
                    week_el.classList.add('extension-energyuse-week-no-device-details');
                }
            
                document.getElementById('extension-energyuse-list').prepend(week_el);
            }
            catch(e){
                console.log("Error in add_week: ", e);
            }
            
            
        }
    
    
    
        // Helper method to get the title of a thing
        get_title(device_id){
            var thing_title = 'Unknown';
            try{
    			for (let key in this.all_things){

                    if( this.all_things[key].hasOwnProperty('href') ){
                    
                        if( this.all_things[key]['href'].endsWith("/" + device_id) ){
        				
            				if( this.all_things[key].hasOwnProperty('title') ){
            					thing_title = this.all_things[key]['title'];
                                break;
            				}
                            
                        }
                    }
                }
            }
            catch(e){
                console.log("Energy Use: get_title: Error looping over things: ", e);
            }
			return thing_title;
        }
    
    
    
        // Helper method that rounds numbers to 2 decimals. If the value is zero it normally returns an empty string.
        rounder(value,show_zero=false){
            if(value != 0){
                let return_string = "" + value.toFixed(2);
                if(return_string == "0.00"){
                    if(value.toFixed(3) == "0.000"){
                        if(show_zero){
                            return "0";
                        }
                        else{
                            return_string = "";
                        }
                            
                    }
                }
                
                if(return_string.startsWith("0.")){
                    return_string = return_string.substring(1);
                }
                
                return return_string;
            }
            else{
                if(show_zero){
                    return "0";
                }
                else{
                    return "";
                }
                
            }
        }
    
    
    
        // helper function to get the device ID from a url
        get_device_id_from_url(url){
            const paths = url.split("/").filter(entry => entry !== "");
            return paths[paths.length - 1];
        }
    
    }

	new Energyuse();
	
})();





















