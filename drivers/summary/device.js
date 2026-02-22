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
			await this.addCapabilitySafe('measure_temperature.internal');
		}

		if (!this.hasCapability('measure_temperature.heatsink'))
		{
			await this.addCapabilitySafe('measure_temperature.heatsink');
		}

		if (!this.hasCapability('system_status'))
		{
			await this.addCapabilitySafe('system_status');
		}

		if (!this.hasCapability('system_status.country'))
		{
			await this.addCapabilitySafe('system_status.country');
		}

		if (!this.hasCapability('system_status.fault_1'))
		{
			await this.addCapabilitySafe('system_status.fault_1');
		}

		if (!this.hasCapability('system_status.fault_2'))
		{
			await this.addCapabilitySafe('system_status.fault_2');
		}

		if (!this.hasCapability('system_status.fault_3'))
		{
			await this.addCapabilitySafe('system_status.fault_3');
		}

		if (!this.hasCapability('system_status.fault_4'))
		{
			await this.addCapabilitySafe('system_status.fault_4');
		}

		if (!this.hasCapability('system_status.fault_5'))
		{
			await this.addCapabilitySafe('system_status.fault_5');
		}
		this.log('StationDevice has been initialized');
	}

	async checkCapabilities(serial)
	{
		const inverter = this.homey.app.getInverter(serial);
		if (inverter)
		{
			this.CapabilitiesChecked = true;

			for (const group of inverter.inverter.parameter_definition.parameters)
			{
				if (group.group === 'panel')
				{
					await this.addRemoveCapability(['meter_power.today_solar'], group.items, 'Daily_Production');
				}
				else if (group.group === 'inverter')
				{
					await this.addRemoveCapability(['measure_power.consumption'], group.items, 'Consumption');
					await this.addRemoveCapability(['meter_power.today_consumption'], group.items, 'Consumed_Today');
					await this.addRemoveCapability(['system_status.country'], group.items, 'Country');
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
			if (!data || typeof data !== 'object')
			{
				return;
			}
			const hasData = (key) => Object.prototype.hasOwnProperty.call(data, key) && data[key] !== null;
			const dd = this.getData();

			if (serial === dd.id)
			{
				if (!this.CapabilitiesChecked)
				{
					await this.checkCapabilities(dd.id);
					this.CapabilitiesChecked = true;
				}

				this.setAvailable();

				if (this.hasCapability('measure_power.consumption') && hasData('Consumption'))
				{
					this.setCapabilityValue('measure_power.consumption', data.Consumption).catch(this.error);
					this.homey.api.realtime('updateWidget', { deviceId: this.__id, capabilityID: 'measure_power', value: data.Consumption });
				}

				if (this.hasCapability('meter_power.today_solar') && hasData('Daily_Production'))
				{
					this.setCapabilityValue('meter_power.today_solar', data.Daily_Production).catch(this.error);
				}

				if (this.hasCapability('meter_power.today_consumption') && hasData('Consumed_Today'))
				{
					this.setCapabilityValue('meter_power.today_consumption', data.Consumed_Today).catch(this.error);
					this.homey.api.realtime('updateWidget', { deviceId: this.__id, capabilityID: 'meter_power.today_consumption', value: data.Consumed_Today });
				}

				if (hasData('Inverter_Status'))
				{
					this.setCapabilityValue('system_status', data.Inverter_Status).catch(this.error);
				}

				if (this.hasCapability('system_status.country') && hasData('Country'))
				{
					this.setCapabilityValue('system_status.country', data.Country).catch(this.error);
				}

				if (hasData('Fault_1'))
				{
					this.setCapabilityValue('system_status.fault_1', data.Fault_1).catch(this.error);
				}
				if (hasData('Fault_2'))
				{
					this.setCapabilityValue('system_status.fault_2', data.Fault_2).catch(this.error);
				}
				if (hasData('Fault_3'))
				{
					this.setCapabilityValue('system_status.fault_3', data.Fault_3).catch(this.error);
				}
				if (hasData('Fault_4'))
				{
					this.setCapabilityValue('system_status.fault_4', data.Fault_4).catch(this.error);
				}
				if (hasData('Fault_5'))
				{
					this.setCapabilityValue('system_status.fault_5', data.Fault_5).catch(this.error);
				}

				if (hasData('Internal_Temperature'))
				{
					this.setCapabilityValue('measure_temperature.internal', data.Internal_Temperature).catch(this.error);
				}
				if (hasData('Heatsink_Temperature'))
				{
					this.setCapabilityValue('measure_temperature.heatsink', data.Heatsink_Temperature).catch(this.error);
				}
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
