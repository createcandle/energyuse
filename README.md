# Energy Use

An add-on for the WebThings Gateway which allows you to see the total energy use of all your energy monitoring devices. 

It's designed with smart sockets with power monitoring functionality in mind. For example, you could use such a smart plug with your oven, fridge, heater, and so forth.

You can learn how much electricity these devices use each day, and how much electricity is used in total.

It has its own interface. There you can see a table showing electricity use by device, per day, and per week.

![Energy use overview](screenshot.jpg?raw=true "Energy use overview")

It also creates a thing with a few properties, such as:
- Yesterday's total KWh consumed
- Today's total Kwh consumed so far
- The Kwh consumed in the past hour.

All three can then be logged using the standard logging features of the Webthings Gateway.

It comes with some privacy enhancing features.
- You can set for how many months you'd like to keep detailed data
- You can set a maximum number of days that detailed device info may be stored. After this period (say, 14 days), the details about each day will be removed, and only the total energy consumed that day will remain. 
- You can use Data Blur to adjust how much data you want to collect. For example, do you want to get updates about energy consumption every 10 seconds, every minute, everny hour, daily, or never.
