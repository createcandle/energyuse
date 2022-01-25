(function() {
	class Energyuse extends window.Extension {
	    constructor() {
	      	super('energyuse');
			//console.log("Adding energyuse addon to menu");
      		
			this.addMenuEntry('Energy use');
			
            
            //var getCountryNames = new Intl.DisplayNames(['en'], {type: 'region'});
            //console.log(getCountryNames);
            //console.log(getCountryNames.of('AL'));  // "Albania"
            
            this.all_things = {};
            
            // privacy
            //this.only_show_day_total = true;
            this.only_show_week_total = false;
            this.device_detail_days = 0;
            
			this.attempts = 0;

	      	this.content = '';
			this.item_elements = []; //['thing1','property1'];
			this.all_things;
			this.items_list = [];
			this.current_time = 0;
            this.previous_day_number = -1;

            this.searching = false;
            this.entered_search_page = false;

            
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
			console.log("energyuse hide called");
			
            try{
				clearInterval(this.interval);
			}
			catch(e){
				console.log("no interval to clear? " + e);
			} 
		}
        
        
        

	    show() {
			console.log("energyuse show called");
			//console.log("this.content:");
			//console.log(this.content);
			
            try{
				clearInterval(this.interval);
			}
			catch(e){
				console.log("no interval to clear?: " + e);
			}
            
			
			const main_view = document.getElementById('extension-energyuse-view');
			
			if(this.content == ''){
				return;
			}
			else{
				//document.getElementById('extension-energyuse-view')#extension-energyuse-view
				main_view.innerHTML = this.content;
			}
			
			const list = document.getElementById('extension-energyuse-list');
				
            // Back button
            /*
            document.getElementById('extension-energyuse-back-button').addEventListener('click', (event) => {
                document.getElementById('extension-energyuse-search-page').style.display = 'none';
                document.getElementById('extension-energyuse-stations-page').style.display = 'block';
                this.get_init_data();
                this.searching = false;
			});*/
            

            
            this.interval = setInterval(() =>{
                this.start();
            },60000); // 600000 = update the display every 10 minutes
            
            this.start();
		}   
		
	
        start(){
            
            // start -> get_init_data -> renegerate_items
            
            console.log("in start");
    	    API.getThings().then((things) => {
			
    			this.all_things = things;
                //console.log("energy use: all things: ", this.all_things);
                this.get_init_data();
            
            });
        }
    
    
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
        
        
    
        get_init_data(){
            console.log('in get_init_data');
			try{
				
		  		// Init
		        window.API.postJson(
		          `/extensions/${this.id}/api/ajax`,
                    {'action':'init'}

		        ).then((body) => {
					console.log("Init API result:");
					console.log(body);
                    
                    this.persistent_data = body.persistent;
                    if(typeof this.persistent_data['device_detail_days'] != 'undefined'){
                        this.device_detail_days = parseInt(this.persistent_data['device_detail_days']);
                        console.log("device_detail_days is set to: " + this.persistent_data['device_detail_days']);
                    }
                    
                    if(this.persistent_data.token == null || this.persistent_data.token == ''){
                        console.log('no token present yet');
                        document.getElementById('extension-energyuse-missing-token').style.display = 'block';
                    }
                    this.regenerate_items(this.persistent_data.energy);
                    
                    if(typeof body.debug != 'undefined'){
                        if(body.debug){
                            this.debug = body.debug;
                            document.getElementById('extension-energyuse-debug-warning').style.display = 'block';
                        }
                    }
                    
                    ///this.start(); // gets things data, and then regenerates the info
					
				
		        }).catch((e) => {
		  			console.log("Error getting Energyuse init data: " + e.toString());
		        });	

				
			}
			catch(e){
				console.log("Error in init: " + e);
			}
        }
    
    
	
		//
		//  REGENERATE ITEMS
		//
	
		regenerate_items(items, page){
			try {
				console.log("regenerating. items: ", items);
		
				const pre = document.getElementById('extension-energyuse-response-data');
				
				const original = document.getElementById('extension-energyuse-original-item');
			    //console.log("original: ", original);
                
                if(typeof items == 'undefined'){
                    items = this.persistent_data.energy;
                }
			
				//items.sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase()) ? 1 : -1) // sort alphabetically
				
                var list = document.getElementById('extension-energyuse-list');
                
                /*
                if(page == 'search'){
                    list = document.getElementById('extension-energyuse-search-results-list');
                    //list.innerHTML = '<span id="extension-energyuse-text-response-field">Search results:</span>';
                }
                */
                
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
                console.log('items:', items);
                
                console.log("items count: ", total_items_count);
                
                
                var week_container = document.createElement('div')
                week_container.setAttribute("class", "extension-energyuse-week-container");
				
                var week_total_kwh = 0;
                var previous_device_count = null;
                var device_count = 0; // if any new devices show up during the week, this will change
                
                var first_date_of_week = null;
                var last_date_of_week = null;
                var last_week_start_epoch = null;
                var week_start_date_string = null;
                
                var previous_day_number = 8; // this will cause a week_container to be immediately made
                
                // Loop over all items
				for( var timestamp in items ){
                    
					var clone = original.cloneNode(true);
					clone.removeAttribute('id');
                    //console.log("clone: ", clone);
                    
                    console.log(" . ");
                    console.log("timestamp: ", timestamp);
                    
                    var first_week_day = false;
                    
                    if(last_week_start_epoch = null){
                        last_week_start_epoch = timestamp;
                    }
                        
                    var should_create_new_week = false;
                    if(last_week_start_epoch != null){
                        if(timestamp - last_week_start_epoch > 618800000){ // at least a week has passed.
                            should_create_new_week = true;
                        }
                    }
                        
                        
                    
                    
                    // Get the date
                    var date = new Date((timestamp - 600) * 1000); // make sure the timestamp is in the day before
                    console.log(date);
                    
                    if(week_start_date_string == null){
                        week_start_date_string = "" + date.getDate()+"/"+(date.getMonth()+1);
                    }
                    
                    const current_day_number = date.getDay();
                    
                    
                    if( current_day_number != this.previous_day_number){
                        
                        if( current_day_number < this.previous_day_number){
                            first_week_day = true;
                        }
                        
                        this.previous_day_number = current_day_number
                        console.log("NEW DAY OK");
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
                        
                        
                        
                        if(first_week_day){
                            
                            last_week_start_epoch = timestamp;
                            
                            // TODO: could indicate if energy use increased or decreased compared to last week, e.g. with a percentage
                            var week_total_el = document.createElement('div')
                            week_total_el.setAttribute("class", "extension-energyuse-week-total");
                            week_total_el.innerHTML = '<span class="extension-energyuse-week-total-start-date">' + week_start_date_string + '</span><span class="extension-energyuse-week-total-kwh">' + week_total_kwh.toFixed(2) + '<pan>';
                            week_container.append(week_total_el);
                            
                            // Create start date string for next week's total
                            week_start_date_string = "" + date.getDate()+"/"+(date.getMonth()+1);
                            
                            list.prepend(week_container);
                            week_container = document.createElement('div')
                            week_container.setAttribute("class", "extension-energyuse-week-container");
                            
                        }
                        
                    }
                    else{
                        console.log("spotted new data for the same day as the previous day");
                    }
                    
                    const day_names = ['sun','mon','tue','wed','thu','fri','sat'];
                    
                    clone.getElementsByClassName("extension-energyuse-item-date")[0].innerHTML = '<span class="extension-energyuse-item-day-name">' + day_names[current_day_number] + '</span><span class="extension-energyuse-item-date">' + date.getDate()+"/"+(date.getMonth()+1 + '</span>');
                    
                    
                    const day = items[timestamp];
                    
                    var day_total = 0;
                    device_count = 0;
                    
                    for (const device_id in day) {
                        if (day.hasOwnProperty(device_id)) {
                            console.log(" -- device_id: ", device_id);
                            
                            var prev_value = day[device_id];
                            var current_value = day[device_id];
                            var delta = 0;
                            
                            if(typeof previous_value[device_id] != 'undefined'){
                                prev_value = previous_value[device_id];
                                delta = current_value - prev_value;
                            }
                            previous_value[device_id] = day[device_id]; // remember what the value was today, so the difference with the next can be calculated
                            
                            day_total += delta;
                            
        					var devel = document.createElement("div");
        					devel.setAttribute("class", "extension-energyuse-item-stack-device");
                            var ael = document.createElement("a");
                            ael.href = '/things/' + device_id;
                            const title = this.get_title(device_id);
                            
                            //var title_span = document.createElement("span");
                            var title_t = document.createTextNode(title);
                            ael.appendChild(title_t);
                            
                            var kwh_span = document.createElement("span");
        					var kwh_t = document.createTextNode(delta.toFixed(2)); //   + "KWh"
                            kwh_span.appendChild(kwh_t);
                            
                            
        					//ael.appendChild(title_span);
                            if(current_day_number == 0){
                                
                            }
                            
                            devel.appendChild(ael);
                            devel.appendChild(kwh_span);
                            
                            // To protect privacy, only show device details if the date is less than X days away from today (maximum 12 weeks)
                            if( (items_counter + this.device_detail_days) > total_items_count){
                                clone.getElementsByClassName("extension-energyuse-item-stack")[0].appendChild(devel)
                                device_count++;
                                if(!showing_device_details){
                                    showing_device_details = true;
                                    console.log('showing device details from now on ');
                                    clone.classList.add("extension-energyuse-item-show-device-names");
                                }
                            }
                        }
                    }
                    
                    clone.getElementsByClassName("extension-energyuse-item-total")[0].innerHTML = day_total.toFixed(2); // + "KWh";
                    week_total_kwh = week_total_kwh + day_total;
                    
                    
                    
                    items_counter++;
                    
                    //console.log("items_counter: ", items_counter);
                    
                    if(items_counter == total_items_count){
                        console.log("arrived at last day recorded (likely yesterday)");
                        clone.classList.add("extension-energyuse-item-today");
                        week_container.append(clone);
                        
                        var week_total_el = document.createElement('div')
                        week_total_el.setAttribute("class", "extension-energyuse-week-total");
                        week_total_el.innerHTML = '<span class="extension-energyuse-week-total-start-date">' + week_start_date_string + '</span><span class="extension-energyuse-week-total-kwh">' + week_total_kwh.toFixed(2) + '<pan>';
                        week_container.append(week_total_el);
                        
                        list.prepend(week_container);
                    }
                    else{
                        //console.log("setting clone to ready_clone");
                        ready_clone = clone; // Remember the element for now. It's only pasted into the list if we're sure the next item isn't for the same day. In that case this clone should be dropped.
                    }
                    
				} // end of looping over all days
			    
			}
			catch (e) {
				// statements to handle any exceptions
				console.log("Error in regenerate_items: ", e); // pass exception object to error handler
			}
		}
	
    
        /*
        // Copy to clipboard
        clip(element_id) {
            var range = document.createRange();
            range.selectNode(document.getElementById(element_id));
            window.getSelection().removeAllRanges(); // clear current selection
            window.getSelection().addRange(range); // to select text
            document.execCommand("copy");
            window.getSelection().removeAllRanges();// to deselect
            alert("Copied song name to clipboard");
        }
        */
    
    }

	new Energyuse();
	
})();


