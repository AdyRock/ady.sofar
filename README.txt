Monitor all aspects of your SoFar inverter in Homey Pro.
Create Flows to turn on washing machines, etc, or charge your car at peak generation.

Supported inverters for LAN connection:
Sofar Hybrid HYD3600ES, etc.

Connection Mode is at the top of the app settings' Manual Devices tab.
Mode changes apply automatically, without restarting the app. Adding or editing
a device and saving it switches to Manual mode. Selecting Automatic keeps saved
devices in the list but does not use them. Deleting the last device restores
Automatic mode; Manual is unavailable while the list is empty.

To change the currency displayed for costs, open the Grid device settings and
set Currency Unit (for example, $ or EUR). This changes the displayed unit only;
enter the tariff rates in that currency.

HY-ES battery power is positive while charging and negative while discharging.
HY-ES users with Flows based on the previous battery power sign should update
those conditions.

Homey Energy uses changes in lifetime energy totals, not the inverter's daily
counters. HY-ES lifetime totals have 1 kWh resolution, so Energy can differ from
the two-decimal Today readings and cannot recover data from before tracking began.
Directional grid metering requires Homey 12.3 or later; battery charge/discharge
energy metering requires Homey 12.4.5 or later on a supported Homey model.
