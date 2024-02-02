/* jslint node: true */

'use strict';

const LanDevice = require('../lan_device');

class InverterDevice extends LanDevice
{

    /**
     * onInit is called when the device is initialized.
     */
    async onInit()
    {
        await super.onInit();

        if (!this.hasCapability('measure_temperature.internal'))
        {
            this.addCapability('measure_temperature.internal');
        }

        if (!this.hasCapability('measure_temperature.heatsink'))
        {
            this.addCapability('measure_temperature.heatsink');
        }

        if (!this.hasCapability('system_status'))
        {
            this.addCapability('system_status');
        }

        if (!this.hasCapability('system_status.country'))
        {
            this.addCapability('system_status.country');
        }

        if (!this.hasCapability('system_status.fault_1'))
        {
            this.addCapability('system_status.fault_1');
        }

        if (!this.hasCapability('system_status.fault_2'))
        {
            this.addCapability('system_status.fault_2');
        }

        if (!this.hasCapability('system_status.fault_3'))
        {
            this.addCapability('system_status.fault_3');
        }

        if (!this.hasCapability('system_status.fault_4'))
        {
            this.addCapability('system_status.fault_4');
        }

        if (!this.hasCapability('system_status.fault_5'))
        {
            this.addCapability('system_status.fault_5');
        }
        this.log('StationDevice has been initialized');
    }

    checkCapabilities(serial)
    {
        const inverter = this.homey.app.getInverter(serial);
        if (inverter)
        {
            this.CapabilitiesChecked = true;

            for (const group of inverter.inverter.parameter_definition.parameters)
            {
                if (group.group === 'panel')
                {
                    if (this.hasCapability('meter_power.today_solar'))
                    {
                        if (!group.items.find((element) => element.name === 'Daily_Production'))
                        {
                            this.removeCapability('meter_power.today_solar');
                        }
                    }
                    else
                    if (group.items.find((element) => element.name === 'Daily_Production'))
                    {
                        this.addCapability('meter_power.today_solar');
                    }
                }
                else if (group.group === 'inverter')
                {
                    if (this.hasCapability('measure_power.consumption'))
                    {
                        if (!group.items.find((element) => element.name === 'Consumption'))
                        {
                            this.removeCapability('measure_power.consumption');
                        }
                    }
                    else if (group.items.find((element) => element.name === 'Consumption'))
                    {
                        this.addCapability('measure_power.consumption');
                    }

                    if (this.hasCapability('meter_power.today_consumption'))
                    {
                        if (!group.items.find((element) => element.name === 'Consumed_Today'))
                        {
                            this.removeCapability('meter_power.today_consumption');
                        }
                    }
                    else if (group.items.find((element) => element.name === 'Consumed_Today'))
                    {
                        this.addCapability('meter_power.today_consumption');
                    }

                    if (this.hasCapability('system_status.country'))
                    {
                        if (!group.items.find((element) => element.name === 'Country'))
                        {
                            this.removeCapability('system_status.country');
                        }
                    }
                    else if (group.items.find((element) => element.name === 'Country'))
                    {
                        this.addCapability('system_status.country');
                    }
                }
            }
        }
    }

    async onSettings({ oldSettings, newSettings, changedKeys })
    {
        // Update settings here
    }

    async updateLanDeviceValues(serial, data)
    {
        try
        {
            const dd = this.getData();

            if (serial === dd.id)
            {
                if (!this.CapabilitiesChecked)
                {
                    this.checkCapabilities(dd.id);
                    this.CapabilitiesChecked = true;
                }

                this.setAvailable();

                this.setCapabilityValue('measure_power.consumption', data.Consumption).catch(this.error);
                this.setCapabilityValue('meter_power.today_solar', data.Daily_Production).catch(this.error);
                this.setCapabilityValue('meter_power.today_consumption', data.Consumed_Today).catch(this.error);
                this.setCapabilityValue('system_status', data.Inverter_Status).catch(this.error);

                if (this.hasCapability('system_status.country'))
                {
                    this.setCapabilityValue('system_status.country', data.Country).catch(this.error);
                }

                this.setCapabilityValue('system_status.fault_1', data.Fault_1).catch(this.error);
                this.setCapabilityValue('system_status.fault_2', data.Fault_2).catch(this.error);
                this.setCapabilityValue('system_status.fault_3', data.Fault_3).catch(this.error);
                this.setCapabilityValue('system_status.fault_4', data.Fault_4).catch(this.error);
                this.setCapabilityValue('system_status.fault_5', data.Fault_5).catch(this.error);

                this.setCapabilityValue('measure_temperature.internal', data.Internal_Temperature).catch(this.error);
                this.setCapabilityValue('measure_temperature.heatsink', data.Heatsink_Temperature).catch(this.error);
            }
        }
        catch (err)
        {
            this.homey.app.updateLog(`getLanDeviceValues: : ${this.homey.app.varToString(err)}`, 0);
            this.setUnavailable(err.message).catch(this.error);
        }
    }

}

module.exports = InverterDevice;
