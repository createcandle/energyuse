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
            this.show_today_details = false;
            
            this.virtual_wattage = 0;

            this.live = null;
            this.live_array = [];
            this.busy_polling = false;
            this.last_ten_measurements = {};

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
                clearInterval(this.wattage_interval); // TODO: doesn't exist?
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
                clearInterval(this.wattage_interval);
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
            
            
            /*
            document.getElementById('extension-energyuse-totals').addEventListener('click', (event) => {
                this.show_today_details = !this.show_today_details;
                this.generate_today_details();
            });
            */
            
            document.getElementById('extension-energyuse-today-real-kwh-container').addEventListener('click', (event) => {
                this.show_today_details = !this.show_today_details;
                this.generate_today_details();
                if(this.show_today_details && window.innerWidth < 1000){
                    document.getElementById('extension-energyuse-today-details').scrollIntoView();
                }
            });
            
            document.getElementById('extension-energyuse-today-combined-kwh-container').addEventListener('click', (event) => {
                this.show_today_details = !this.show_today_details;
                this.generate_today_details();
                if(this.show_today_details && window.innerWidth < 1000){
                    document.getElementById('extension-energyuse-today-details').scrollIntoView();
                }
            });
            
            document.getElementById('extension-energyuse-real-wattage-container').addEventListener('click', (event) => {
                this.show_today_details = !this.show_today_details;
                this.generate_today_details();
                if(this.show_today_details && window.innerWidth < 1000){
                    document.getElementById('extension-energyuse-today-details').scrollIntoView();
                }
            });
            
            document.getElementById('extension-energyuse-total-wattage-container').addEventListener('click', (event) => {
                this.show_today_details = !this.show_today_details;
                this.generate_today_details();
                if(this.show_today_details && window.innerWidth < 1000){
                    document.getElementById('extension-energyuse-today-details').scrollIntoView();
                }
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
                if(this.debug){
                    console.log("watt value changed: ", event);
                }
                const kwh_from_watt = (document.getElementById('extension-energyuse-add-virtual-watt').value * 24) / 1000;
                if(this.debug){
                    console.log("kwh from watt: ", kwh_from_watt);
                }
                document.getElementById('extension-energyuse-add-virtual-kwh').value = Math.round(kwh_from_watt * 10) / 10;
            });
            
            document.getElementById('extension-energyuse-add-virtual-kwh').addEventListener('keyup', (event) => {
                if(this.debug){
                    console.log("kwh value changed: ", event);
                }
                const watt_from_kwh = (document.getElementById('extension-energyuse-add-virtual-kwh').value * 1000) / 24;
                if(this.debug){
                    console.log("watt_from_kwh: ", watt_from_kwh);
                }
                document.getElementById('extension-energyuse-add-virtual-watt').value = Math.round(watt_from_kwh * 10) / 10;
            });
            
            document.getElementById('extension-energyuse-show-cost-button').addEventListener('click', (event) => {
                if(this.debug){
                    console.log("document.getElementById('extension-energyuse-kwh-price').value: ", document.getElementById('extension-energyuse-kwh-price').value);
                }
                
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
                                if(this.debug){
                                    console.log("energy use debug: save_kwh_price response: ", body);
                                }
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
            this.wattage_interval = setInterval(() =>{
                this.get_today();
            },5000);
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
        //  GET TODAY POLL
        //
        // Get data from addon backend about how much energy the devices are using at the moment, and show that value in the big circles.
        // Also creates a dictionary with that data to be used for creating the small table if the user wants to view that
        
        get_today(){
            
            if(this.busy_polling == true){
                if(this.debug){
                    console.warn("get_today: already busy polling. Aborting.");
                }
                return
            }
            this.busy_polling = true;
            
            window.API.postJson(
              `/extensions/${this.id}/api/ajax`,
    			{'action':'poll'}
            ).then((body) => {
                if(this.debug){
                    console.log("Energy use poll response: ", body);
                }
                
                if(typeof body.live != 'undefined'){
                    this.live = body.live;
                }
                
                if(typeof body.last_ten_measurements != 'undefined'){
                    this.last_ten_measurements = body.last_ten_measurements;
                    if(this.debug){
                        console.log("this.last_ten_measurements: ", this.last_ten_measurements);
                    }
                }
                
                if(body.data_blur == 'Off' || body.data_blur == '1 minute'){
                    document.getElementById('extension-energyuse-real-wattage').innerText = this.rounder(body.real_total_power);
                    document.getElementById('extension-energyuse-total-wattage').innerText = this.rounder(body.real_total_power + body.virtual_total_power);
                    document.getElementById('extension-energyuse-real-wattage-container').style.display = 'block';
                    document.getElementById('extension-energyuse-total-wattage-container').style.display = 'block';
                }
                else{
                    document.getElementById('extension-energyuse-real-wattage-container').style.display = 'none';
                    document.getElementById('extension-energyuse-total-wattage-container').style.display = 'none';
                }
                
                //document.getElementById('extension-energyuse-today-real-kwh').innerText = this.rounder(body.total_real_kwh_since_midnight);
                
                if(body.total_virtual_kwh_since_midnight != null && body.total_virtual_kwh_since_midnight != 0){
                    document.getElementById('extension-energyuse-today-combined-kwh').innerText = this.rounder(body.total_virtual_kwh_since_midnight + body.total_real_kwh_since_midnight);
                }
                
                
                /*
                previous_hour_day_delta
                real_total_power
                total_real_kwh_since_midnight
                total_virtual_kwh_since_midnight
                virtual_total_power
                */
                
                
                
                
                
                // today so far kWh combined
                var kwh_value = null;
                /*
                if(body.total_real_kwh_since_midnight != null){
                    kwh_value = body.total_real_kwh_since_midnight;
                }
                else if(body.previous_hour_day_delta != null){
                    kwh_value = body.previous_hour_day_delta;
                }
                */
                if(body.total_virtual_kwh_since_midnight != null){
                    if(body.data_blur == 'Off' || body.data_blur == '1 minute'){
                        kwh_value = body.total_real_kwh_since_midnight + body.total_virtual_kwh_since_midnight
                     //body.total_real_kwh_since_midnight;
                    }
                    else if(body.data_blur == '1 hour'){
                        kwh_value = body.previous_hour_day_delta;
                    }
                
                    if(kwh_value == null){
                        if(this.debug){
                            console.log("not showing combined kWh value because of data blur setting");
                        }
                        document.getElementById('extension-energyuse-today-combined-kwh-container').style.display = 'none';
                    }
                    else{
                        var today_so_far_html = '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(kwh_value, true) + '</span>'; // rounder true parameter indicates: show zero values
                        if(this.showing_cost && this.current_energy_price != null){
                            today_so_far_html += '<span class="extension-energyuse-cost">' + this.rounder( kwh_value * this.current_energy_price, true) + '</span>';
                        }
                        document.getElementById('extension-energyuse-today-combined-kwh').innerHTML = today_so_far_html;
                        document.getElementById('extension-energyuse-today-combined-kwh').style.display = 'block';
                    }
                }
                
                
                // today so far kWh real
                if(body.data_blur == 'Off' || body.data_blur == '1 minute'){
                    if( this.rounder(kwh_value) != this.rounder(body.total_real_kwh_since_midnight) ){ // make sure the real kwh is actually different by comparing if the the kwh_value which is still set with the total combined
                        kwh_value = body.total_real_kwh_since_midnight; // could still be set to null here if body.total_real_kwh_since_midnight happens to be null
                    }
                    else{
                        kwh_value = null;
                    }
                }
                else{
                    kwh_value = null;
                }
                
                if(kwh_value == null){
                    if(this.debug){
                        console.log("not showing real kWh value (because of data blur setting or not needed)");
                    }
                    document.getElementById('extension-energyuse-today-real-kwh-container').style.display = 'none';
                }
                else{
                    var today_so_far_html = '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(kwh_value, true) + '</span>'; // rounder true parameter indicates: show zero values
                    if(this.showing_cost && this.current_energy_price != null){
                        today_so_far_html += '<span class="extension-energyuse-cost">' + this.rounder( kwh_value * this.current_energy_price, true) + '</span>';
                    }
                    document.getElementById('extension-energyuse-today-real-kwh').innerHTML = today_so_far_html;
                    document.getElementById('extension-energyuse-today-real-kwh-container').style.display = 'block';
                }
                
                
                this.generate_today_details();
                
                
                this.busy_polling = false;
                
            }).catch((e) => {
      			console.log("get_today: error adding virtual energy measurement device: ", e);
                this.busy_polling = false;
            });
        
        }
        
        
        
        // From https://github.com/glaszig/sparkline under MIT licence
        generate_sparkline(svg_el,data){
            
            function getY(max, height, diff, value) {
              if (max === 0) return height * 1.0
              return parseFloat((height - (value * height / max) + diff).toFixed(2));
            }

            function removeChildren(svg) {
              [...svg.querySelectorAll("*")].forEach(element => svg.removeChild(element));
            }

            function defaultFetch(entry) {
              return entry.value;
            }

            function buildElement(tag, attrs) {
              const element = document.createElementNS("http://www.w3.org/2000/svg", tag);

              for (let name in attrs) {
                element.setAttribute(name, attrs[name]);
              }

              return element;
            }


            function sparkline(svg, entries, options) {
              console.log("in sparkline function. svg and entries: ", svg, entries);
              removeChildren(svg);

              if (entries.length <= 1) {
                return;
              }

              options = options || {};

              if (typeof(entries[0]) === "number") {
                entries = entries.map(entry => {
                  return {value: entry};
                });
              }

              // This function will be called whenever the mouse moves
              // over the SVG. You can use it to render something like a
              // tooltip.
              const onmousemove = options.onmousemove;

              // This function will be called whenever the mouse leaves
              // the SVG area. You can use it to hide the tooltip.
              const onmouseout = options.onmouseout;

              // Should we run in interactive mode? If yes, this will handle the
              // cursor and spot position when moving the mouse.
              const interactive = ("interactive" in options) ? options.interactive : !!onmousemove;

              // Define how big should be the spot area.
              const spotRadius = options.spotRadius || 2;
              const spotDiameter = spotRadius * 2;

              // Define how wide should be the cursor area.
              const cursorWidth = options.cursorWidth || 2;

              // Get the stroke width; this is used to compute the
              // rendering offset.
              const strokeWidth = parseFloat(svg.attributes["stroke-width"].value);

              // By default, data must be formatted as an array of numbers or
              // an array of objects with the value key (like `[{value: 1}]`).
              // You can set a custom function to return data for a different
              // data structure.
              const fetch = options.fetch || defaultFetch;

              // Retrieve only values, easing the find for the maximum value.
              const values = entries.map(entry => fetch(entry));

              // The rendering width will account for the spot size.
              const width = parseFloat(svg.attributes.width.value) - spotDiameter * 2;

              // Get the SVG element's full height.
              // This is used
              const fullHeight = parseFloat(svg.attributes.height.value);

              // The rendering height accounts for stroke width and spot size.
              const height = fullHeight - (strokeWidth * 2) - spotDiameter;

              // The maximum value. This is used to calculate the Y coord of
              // each sparkline datapoint.
              const max = Math.max(...values);
              //console.log("sparklines function: max: ", max);
              // Some arbitrary value to remove the cursor and spot out of
              // the viewing canvas.
              const offscreen = -1000;

              // Cache the last item index.
              const lastItemIndex = values.length - 1;

              // Calculate the X coord base step.
              const offset = width / lastItemIndex;

              // Hold all datapoints, which is whatever we got as the entry plus
              // x/y coords and the index.
              const datapoints = [];

              // Hold the line coordinates.
              const pathY = getY(max, height, strokeWidth + spotRadius, values[0]);
              let pathCoords = `M${spotDiameter} ${pathY}`;

              values.forEach((value, index) => {
                const x = index * offset + spotDiameter;
                const y = getY(max, height, strokeWidth + spotRadius, value);

                datapoints.push(Object.assign({}, entries[index], {
                  index: index,
                  x: x,
                  y: y
                }));

                pathCoords += ` L ${x} ${y}`;
              });

              const path = buildElement("path", {
                class: "extension-energyuse-sparkline--line",
                d: pathCoords,
                fill: "none"
              });

              let fillCoords = `${pathCoords} V ${fullHeight} L ${spotDiameter} ${fullHeight} Z`;

              const fill = buildElement("path", {
                class: "extension-energyuse-sparkline--fill",
                d: fillCoords,
                stroke: "none"
              });

              svg.appendChild(fill);
              svg.appendChild(path);

              if (!interactive) {
                return;
              }

              const cursor = buildElement("line", {
                class: "extension-energyuse-sparkline--cursor",
                x1: offscreen,
                x2: offscreen,
                y1: 0,
                y2: fullHeight,
                "stroke-width": cursorWidth
              });

              const spot = buildElement("circle", {
                class: "extension-energyuse-sparkline--spot",
                cx: offscreen,
                cy: offscreen,
                r: spotRadius
              });

              svg.appendChild(cursor);
              svg.appendChild(spot);

              const interactionLayer = buildElement("rect", {
                width: svg.attributes.width.value,
                height: svg.attributes.height.value,
                style: "fill: transparent; stroke: transparent",
                class: "extension-energyuse-sparkline--interaction-layer",
              });
              svg.appendChild(interactionLayer);

              interactionLayer.addEventListener("mouseout", event => {
                cursor.setAttribute("x1", offscreen);
                cursor.setAttribute("x2", offscreen);

                spot.setAttribute("cx", offscreen);

                if (onmouseout) {
                  onmouseout(event);
                }
              });

              interactionLayer.addEventListener("mousemove", event => {
                const mouseX = event.offsetX;

                let nextDataPoint = datapoints.find(entry => {
                  return entry.x >= mouseX;
                });

                if (!nextDataPoint) {
                  nextDataPoint = datapoints[lastItemIndex];
                }

                let previousDataPoint = datapoints[datapoints.indexOf(nextDataPoint) - 1];
                let currentDataPoint;
                let halfway;

                if (previousDataPoint) {
                  halfway = previousDataPoint.x + ((nextDataPoint.x - previousDataPoint.x) / 2);
                  currentDataPoint = mouseX >= halfway ? nextDataPoint : previousDataPoint;
                } else {
                  currentDataPoint = nextDataPoint;
                }

                const x = currentDataPoint.x;
                const y = currentDataPoint.y;

                spot.setAttribute("cx", x);
                spot.setAttribute("cy", y);

                cursor.setAttribute("x1", x);
                cursor.setAttribute("x2", x);

                if (onmousemove) {
                  onmousemove(event, currentDataPoint);
                }
              });
              //return svg;
            }
            
            //return sparkline(svg_el,data);
            
            sparkline(svg_el,data);
            return svg_el;
            
            //return element; //
            
        }
        
        
        
        
        //
        //  GENERATE TODAY LIVE DETAILS
        //
        // Show live power consumption in a small table. Assumes this.device_details has already been created
        generate_today_details(){
            if(this.debug){
                console.log("in generate_today_details. this.show_today_details: ", this.show_today_details);
            }
            if(this.live == null){
                console.warn("energy use: generate_today_details: this.live is still null");
                return;
            }
            if(this.debug){
                console.log("generate_today_details: live: ", this.live);
            }
            
            this.live_array = [];

            for (var key in this.live) {
                if (this.live.hasOwnProperty(key)) {
                    this.live_array.push( this.live[key] );
                }
            }
            this.live_array.sort((a, b) => (a.title.toLowerCase() > b.title.toLowerCase()) ? 1 : -1) // sort alphabetically
            //console.log("sorted this.live_array: ", this.live_array);
            
            
            try{
                let today_details_el = document.getElementById('extension-energyuse-today-details');
                today_details_el.innerHTML = "";
                
                if(this.show_today_details == false){
                    today_details_el.style.display = 'none';
                    return;
                }
                
                today_details_el.style.display = 'block';
                
                const current_timestamp = Math.floor(Date.now() / 1000);
                
                for(let w = 0; w < this.live_array.length; w++){
                    if(this.debug){
                        console.log("this.live_array[w]: ", this.live_array[w]);
                    }
                    
                    
                    //const device_id = keys[w];
                    //const title = this.live[device_id]['title'];
                    const id = this.live_array[w]['id'];
                    const title = this.live_array[w]['title'];
                    
                    
                    //console.log('title: ', title);
                    let device_el = document.createElement('div');
                    device_el.classList.add('extension-energyuse-wattage-device');
            
                    //var ignore_class = "";
                    if(this.live_array[w].ignored){
                        //ignore_class = " ignore ";
                        device_el.classList.add('extension-energyuse-wattage-device-ignored');
                        device_el.setAttribute('title','Ignored device');
                    }
                
                    var today_kwh_cost_html ="";
                    var today_kwh_cost = "";
                    var today_kwh_value = "";
                    if(typeof this.live_array[w]['kwh'] != 'undefined'){
                        today_kwh_value = this.live_array[w]['kwh'];
                        if(this.showing_cost && this.current_energy_price != null){
                            today_kwh_cost_html = '<span class="extension-energyuse-cost">' + this.rounder( today_kwh_value * this.current_energy_price ) + '</span>';
                        }
                    }
                    
                    if( this.live_array[w]['virtual'] ){
                        device_el.classList.add('extension-energyuse-wattage-device-virtual');
                        device_el.setAttribute('title','Virtual device');
                    }
                    
                    var today_device_html =  '<span class="extension-energyuse-wattage-device-title">' + title + '</span>';
                        today_device_html += '<span class="extension-energyuse-wattage-and-kwh">';
                        
                        try{
                            let spark_el = document.createElement('svg');
                            spark_el.setAttribute('width','100');
                            spark_el.setAttribute('height','15');
                            spark_el.setAttribute('stroke-width','2');
                            spark_el.setAttribute('alt','Last 10 power measurements');
                            spark_el.setAttribute('title','Last 10 power measurements');
                            spark_el.classList.add('extension-energyuse-live-sparkline');
                        
                            //console.log("last_ten_measuements: id: ", id, this.last_ten_measurements);
                            //console.log("this.last_ten_measurements[id]: ", this.last_ten_measurements[id]);
                            if(typeof this.last_ten_measurements[id] != 'undefined'){
                                if(this.last_ten_measurements[id].length > 2){
                                    var all_zeros = true;
                                    for(let s = 0; s < this.last_ten_measurements[id].length; s++){
                                        if(this.last_ten_measurements[id][s] != 0){
                                            all_zeros = false;
                                        }
                                    }
                                    if(all_zeros == false){
                                    
                                        spark_el.classList.add('extension-energyuse-live-sparkline-active');
                                        //sparkline(spark_el, this.last_ten_measurements[id] );
                                        spark_el = this.generate_sparkline(spark_el,this.last_ten_measurements[id]);
                                        
                                        //'<svg class="sparkline" width="100" height="30" stroke-width="3"></svg>';
                                    }
                                
                                }
                            }
                            today_device_html += spark_el.outerHTML;
                        }
                        catch(e){
                            console.error("Error generating sparkline: ", e);
                        }
                        
                        today_device_html += '<span class="extension-energyuse-wattage-device-value">' + this.rounder(this.live_array[w].power) + '</span>';
                        today_device_html += '<span class="extension-energyuse-today-kwh-and-cost"><span class="extension-energyuse-today-kwh-value">' + today_kwh_value + '</span>' + today_kwh_cost_html + '</span>'
                        today_device_html += '</span>';
                    
                    device_el.innerHTML = today_device_html;
            
                    today_details_el.appendChild(device_el);
                }
                
                //if(this.show_today_details){
                
                    // Get the real devices wattage
                    //var keys = Object.keys(this.live);
                    //console.log('keys: ', keys);
                    //keys.sort();
                    
                    // TODO: sort by title
                    
                    
                    
                
                    
                
                //}
            }
            catch(e){
                console.error("Error in generate_today_details: ", e);
            }
            
        }
        
        
        
        
        
        
        
        //
        //  GENERATE (IGNORED) DEVICES LIST
        //
        // Allow the user to skip over some devices when calculating the total energy use. Could be expanded to other settings.
        generate_devices_list(){
            if(this.debug){
                console.log("in generate_devices_list (ignored devices). this.live_array: ", this.live_array );
            }
            
            let ignore_list_el = document.getElementById('extension-energyuse-devices-list');
            ignore_list_el.innerHTML = "";
            //ignore_list_el.style.display = 'block';
            
            //if(this.persistent_data.ignore.indexOf(device_id) > -1 ){}
            //
            
            // Get the real devices
            //var keys = Object.keys(this.device_details);
            //console.log('keys: ', keys);
            //keys.sort(); 
            for(let w = 0; w < this.live_array.length; w++){
                if(this.live_array[w]['virtual']){
                    continue; // skip virtual devices
                }
                //console.log("generate_devices_list: this.live_array[w]: ", this.live_array[w]);
                
                const title = this.live_array[w]['title'];
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
                ignore_checkbox_el.name = "extension-energyuse-devices-list-" + this.live_array[w].id;
                //ignore_checkbox_el.value = "value";
                ignore_checkbox_el.id = "extension-energyuse-devices-list-" + this.live_array[w].id;
                if(this.live_array[w].ignored){
                    ignore_checkbox_el.checked = true;
                }
                
                ignore_checkbox_el.addEventListener('change', (event) => {
                    if(this.debug){
                        console.log("checkbox changed. w, device_id, checked: ", w, this.live_array[w].id, ignore_checkbox_el.checked);
                    }
                    
                    
        	        window.API.postJson(
        	          `/extensions/${this.id}/api/ajax`,
        				{'action':'ignore','choice':ignore_checkbox_el.checked,'device_id':this.live_array[w].id}
        	        ).then((body) => {
                        if(this.debug){
                            console.log("Changed device ignore state. response: ", body);
                        }
                        //console.log("Changed device ignore state. response: ", body);
                        //if(body.state == true){    
                        //}
                    
                        this.persistent_data.ignore = body.ignore; // TODO; not really used here anymore, no need to update it?
                        
                        if(body.state == false){
                            setTimeout(() => {
                                this.generate_devices_list();
                            }, 100);
                        }
                        
        	        }).catch((e) => {
        	  			console.log("error setting device ignore state: ", e);
        	        });
                    
                    this.live_array[w].ignored = ignore_checkbox_el.checked;
                    
                    return false;
                });
                
                device_el.appendChild(ignore_checkbox_el);
            
                ignore_list_el.appendChild(device_el);
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
                        this.debug = body.debug;
                        if(this.debug){
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
                    
                    this.get_today();
				
                    if(typeof this.persistent_data.ignore != 'undefined'){
                        this.generate_devices_list();
                    }
                
                
                    if(typeof this.persistent_data.virtual != 'undefined'){
                        this.generate_virtual_list();
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
                        console.log("enegy use: virtual: ", virtual);
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
                        return false;
                        
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
                if(this.showing_cost){
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
                        if(this.debug){
                            console.log("device_id: ", device_id);
                        }
                        //console.log("week: ", week);
                        //console.log("week[device_id]: ", week[device_id]);
                        if(typeof week[device_id] != 'undefined'){
                            if(typeof week[device_id]['title'] != 'undefined'){
                                week_device_titles.push(week[device_id]['title']);
                            }
                            else{
                                if(this.debug){
                                    console.log("energy use: add_week: missing thing title: ", week[device_id]);
                                }
                            }
                        }
                        else{
                            if(this.debug){
                                console.warn("week[device_id] missing? how is this possible?: ", device_id, week);
                            }
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
                var maximum_days_used = 0;
                var yearly_total = 0;
                for (const sorted_device_title in week_device_titles) {
                    //console.log("sorted_device_title: ", week_device_titles[sorted_device_title]);
                    
                    for (const device_id in week) {
                        //console.log("device_id in week: ", device_id);
                        //console.log("week[device_id]['title']: ", week[device_id]['title']);
                        
                        if(typeof week[device_id] == 'undefined'){
                            if(this.debug){
                                console.log("energy use: week[device_id] was undefined");
                            }
                            continue;
                        }
                        if(typeof week[device_id]['title'] == 'undefined'){
                            if(this.debug){
                                console.log("energy use: week[device_id][title] was undefined");
                            }
                            continue;
                        }
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
                                
                                if(days_used > maximum_days_used){
                                    maximum_days_used = days_used;
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
                                    
                                    const week_scale_factor = 7 / maximum_days_used; // if there is only data for part of the week, then compensate for that in the calculation too.
                                    const device_yearly_kwh_prediction = (device_kwh_total * week_scale_factor) * 52.17857;
                                    //console.log("average kwh per day: ", average_per_day);
                                    //console.log("yearly_kwh_prediction: ", yearly_kwh_prediction);
                                    yearly_total = yearly_total + device_yearly_kwh_prediction;
                        
                                    output += '<td class="extension-energyuse-device-yearly extension-energyuse-column-yearly">';
                                    output += '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(device_yearly_kwh_prediction) + '</span>';
                        
                                    if(this.showing_cost && this.current_energy_price != null){
                                        output += '<span class="extension-energyuse-cost">' + this.rounder( device_yearly_kwh_prediction * this.current_energy_price ) + '</span>';
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
                
                if(this.debug){
                    console.log("maximum_days_used: ", maximum_days_used);
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
                    
                    footer_html += '<span class="extension-energyuse-kwh" title="kWh">' + this.rounder(yearly_total) + '</span>';
                    if(this.showing_cost && this.current_energy_price != null){
                        footer_html += '<span class="extension-energyuse-cost">' + this.rounder( yearly_total * this.current_energy_price ) + '</span>';
                    }
                    
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





















