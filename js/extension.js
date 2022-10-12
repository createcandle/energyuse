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
			this.current_time = 0;
            this.previous_day_number = -1;

            this.searching = false;
            this.entered_search_page = false;

            setTimeout(() => {
                const jwt = localStorage.getItem('jwt');
                //console.log("jwt: ", jwt);
    	        window.API.postJson(
    	          `/extensions/${this.id}/api/ajax`,
    				{'action':'save_token','jwt':jwt}

    	        ).then((body) => {
                    console.log("energy use delayed update jwt response: ", body);
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
            },1200000); // 1200000 = update the display every 20 minutes
            
            this.start();
		}   
		
	
        start(){
            
            // start -> get_init_data -> renegerate_items
            
            //console.log("in start");
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
            //console.log('in get_init_data');
			try{
				
                const jwt = localStorage.getItem('jwt');
                
		  		// Init
		        window.API.postJson(
		          `/extensions/${this.id}/api/ajax`,
                    {'action':'init', 'jwt':jwt}

		        ).then((body) => {
					
                    
                    this.persistent_data = body.persistent;
                    if(typeof this.persistent_data['device_detail_days'] != 'undefined'){
                        this.device_detail_days = parseInt(this.persistent_data['device_detail_days']);
                        //console.log("device_detail_days is set to: " + this.persistent_data['device_detail_days']);
                    }
                    
                    if(this.persistent_data.token == null || this.persistent_data.token == ''){
                        //console.log('no token present yet');
                        document.getElementById('extension-energyuse-missing-token').style.display = 'block';
                    }
                    
                    
                    if(typeof body.debug != 'undefined'){
                        if(body.debug){
                            this.debug = body.debug;
                            document.getElementById('extension-energyuse-debug-warning').style.display = 'block';
        					console.log("Energy use init API result: ");
        					console.log(body);
                        }
                    }
                    
                    if(typeof this.persistent_data.grand_total != 'undefined'){
                        //document.getElementById('extension-energyuse-totals').style.display = 'block';
                        if(this.persistent_data.grand_total != 0){
                            document.getElementById('extension-energyuse-grand-total').innerText = this.persistent_data.grand_total;
                        }
                    }
                    
                    this.regenerate_items(this.persistent_data.energy);
					
				
		        }).catch((e) => {
		  			console.log("Error getting Energyuse init data: ", e);
		        });	

				
			}
			catch(e){
				console.log("Error in get_init_data: ", e);
			}
        }
    
    
	
		//
		//  REGENERATE ITEMS
		//
	
    
    
    
		regenerate_items(items, page){
			try {
				if(this.debug){
                    console.log("regenerating. items: ", items);
                }
		
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
                var week_available_day_number = 0;
                
                
                var previous_timestamp = null;
                
                const current_timestamp = Math.round(Date.now() / 1000);
                const details_threshold_timestamp = current_timestamp - (this.device_detail_days * 86400);
                //console.log("details_threshold_timestamp: ", details_threshold_timestamp);
                var details_threshold_date = new Date((details_threshold_timestamp - 600) * 1000);
                //console.log("\nDETAILS THRESHOLD DATE: ", details_threshold_date);
                
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
                    
                    
                    
                    //
                    
                    
                    //if(timestamp > )
                    
                    // To protect privacy, only show device details if the date is less than X days away from today (maximum 12 weeks)
                    /*
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
                    //console.log("showing_device_details: ", showing_device_details);
                    
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
                        
                            week_devices = {};
                            week_available_day_number = 1; // does not start at 0
                        }
                        else{
                            //console.log('a week has not yet passed');
                        }
                    }
                    
                    
                    
                    if(timestamp > details_threshold_timestamp){
                        if(this.debug){
                            console.log("\nsetting showing_device_details to TRUE <---------------------------------------------\n");
                        }
                        showing_device_details = true;
                    }
                    
                    
                    /*
                    if(last_week_start_epoch != null){
                        
                    }
                    else{
                        console.log("last_week_start_epoch was still null");
                    }
                    */
                    //console.log("week_available_day_number: ", week_available_day_number);
                        
                    
                    
                    
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
                            
                            week_devices = {};
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
                    
                    for (const device_id in day) {
                        if (day.hasOwnProperty(device_id)) {
                            //console.log(" -- device_id: ", device_id);
                            const title = this.get_title(device_id);
                            //console.log(" -- device title: ", title);
                            
                            var prev_value = day[device_id];
                            var current_value = day[device_id];
                            var delta = 0;
                            
                            if(typeof previous_value[device_id] != 'undefined'){
                                prev_value = previous_value[device_id];
                                delta = current_value - prev_value;
                                
                                if(typeof week_devices[device_id] == 'undefined'){
                                    week_devices[device_id] = {'device_id':device_id, 'title':title, 'was_used':false, 'days':[] }; // 'week_available_days':week_available_day_number,
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
    
        
        
        
        
        add_week(week, showing_device_details){
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
            
            for (const device_id in week) {
                
                let device = week[device_id];
                
                if(this.debug){
                    console.log("device: ", device_id);
                }
                //console.log("device-> was_used: ", device['was_used']);
                
                if(device['was_used'] == true){
                    
                    at_least_one_device_was_used = true;
                    
                    let device_id = device['device_id'];
                    //console.log("device_id: " + device_id);
                    if(showing_device_details){
                        output += "<tr>";
                        output += '<td class="extension-energyuse-device-title"><a href="/things/' + device_id + '">' + device['title'] + '</a></td>';
                    }
                    
                    let device_kwh_total = 0;
                    
                    let start_kwh = null;
                    let end_kwh = null;
                    
                    
                    
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
                            if(this.debug){
                                console.log(device['title'] + " was used today. Day data:", today_data);
                            }
                            device_kwh_total = device_kwh_total + today_data['relative'];
                            if(this.debug){
                                console.log("device_kwh_total by relative addition: ", device_kwh_total);
                            }
                            
                            if(showing_device_details){
                                output += this.rounder(today_data['relative']);
                            }
                            
                            date_strings[d] = '<span class="th-day-name">' + today_data['day_name'] + '</span><br/><span class="th-day-date">' + today_data['date'] + '</span>';
                            
                            //device_kwh_total = device_kwh_total + today_data['relative'];
                            day_kwh_totals[d] = day_kwh_totals[d] + today_data['relative'];
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
                    week_total = week_total + device_kwh_total;
                    
                    
                    if(showing_device_details){
                        output += '<td class="extension-energyuse-device-total extension-energyuse-column-total">' + this.rounder(device_kwh_total) + '</td><tr>'; // device_total.toFixed(2)
                    }
                    
                }
                else{
                    if(this.debug){
                        console.log("skipping device that was not used this week: ", device['title']);
                    }
                }
                
                
            }
            
            if(at_least_one_device_was_used){
                if(this.debug){
                    console.log("at least one device was used.");
                }
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
                header_html += '<th class="extension-energyuse-device-total extension-energyuse-column-total"></th></tr>';
                //console.log("header_html: " , header_html);
                output = header_html + output;
                
                footer_html += '<tr class="extension-energyuse-sums"><td class="extension-energyuse-nothing"></td>';
                for(let d = 1; d < 8; d++){
                    footer_html += '<td class="extension-energyuse-day-sum-' + d + '">';
                    if(day_kwh_totals[d] > 0){
                        footer_html += this.rounder(day_kwh_totals[d]);
                    }
                    footer_html +='</td>';
                }
                footer_html += '<td class="extension-energyuse-week-total extension-energyuse-column-total">' + this.rounder(week_total) + '</td></tr>';
                //console.log("footer_html: " , footer_html);
                
                output += footer_html;
                
            }
            else{
                //console.log("No devices used any power?");
                output += "<tr><td></td></tr>";
            }
            
            output = '<table>' + output + '</table>';
            
            
            week_el.innerHTML = output;
            
            document.getElementById('extension-energyuse-list').prepend(week_el);
            
            
        }
    
    
    
    
        rounder(value){
            if(value > 0){
                let return_string = "" + value.toFixed(2);
                if(return_string == "0.00"){
                    if(value.toFixed(3) == "0.000"){
                        return_string = "";
                    }
                }
                
                if(return_string.startsWith("0.")){
                    return_string = return_string.substring(1);
                }
                
                return return_string;
            }
            else{
                return "";
            }
        }
    
    
    }

	new Energyuse();
	
})();





















