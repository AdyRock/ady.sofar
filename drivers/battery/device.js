/* jslint node: true */

'use strict';

const LanDevice = require('../lan_device');

class BatteryDevice extends LanDevice
{

    /**
     * onInit is called when the device is initialized.
     */
    async onInit()
    {
        await super.onInit();

        this.log('BatteryDevice has been initialized');
    }

    async updateLanDeviceValues(serial, data)
    {
        try
        {
            const dd = this.getData();

            if (serial === dd.id)
            {
                this.setAvailable();

                this.setCapabilityValue('measure_power', -data.Battery_Power).catch(this.error);
                this.setCapabilityValue('measure_battery', data.Battery_Charge).catch(this.error);

                this.setCapabilityValue('meter_power.charge_today', data.Battery_Charge_Today).catch(this.error);
                this.setCapabilityValue('meter_power.discharge_today', data.Battery_Discharge_Today).catch(this.error);
                this.setCapabilityValue('meter_power.charge_total', data.Battery_Charge_Total).catch(this.error);
                this.setCapabilityValue('meter_power.discharge_total', data.Battery_Discharge_Total).catch(this.error);

                this.setCapabilityValue('measure_voltage.battery', data.Battery_Voltage).catch(this.error);
                this.setCapabilityValue('measure_current.battery', data.Battery_Current).catch(this.error);
                this.setCapabilityValue('measure_temperature.battery', data.Battery_Temperature).catch(this.error);
                this.setCapabilityValue('measure_cycles.battery', data.Battery_Cycles).catch(this.error);
            }
        }
        catch (err)
        {
            this.homey.app.updateLog(`updateLanDeviceValues: : ${this.homey.app.varToString(err)}`);
            this.setUnavailable(err.message).catch(this.error);
        }
    }

}

module.exports = BatteryDevice;
