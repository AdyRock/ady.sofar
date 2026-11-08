/* jslint node: true */

'use strict';

const LanDevice = require('../lan_device');

class SolarPanelDevice extends LanDevice
{

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit()
	{
		await super.onInit();
		this.sumPV1_PV2 = false;

		this.log('SolarPanelDevice has been initialized');
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
					if (!group.items.find((element) => element.name === 'PV_Power'))
					{
						this.sumPV1_PV2 = true;
					}

					await this.addRemoveCapability(['meter_power.today'], group.items, 'Daily_Production');
					await this.addRemoveCapability(['measure_generation_time'], group.items, 'Generation_Time_Today');
					await this.addRemoveCapability(['measure_generation_time_total'], group.items, 'Generation_Time_Total');
				}

				if (group.group === 'inverter')
				{
					await this.addRemoveCapability(['meter_power'], group.items, 'Total_Generation');
				}
			}
		}
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

				// Some inverters return implausible values in the per-string registers (e.g. ZCS rebrands of
				// the HYD-ES), so only publish the string readings when the string powers are consistent with
				// the total PV power, and clear them when they are not so stale values are not displayed
				let stringsPlausible = true;
				if (hasData('PV_Power') && (hasData('PV1_Power') || hasData('PV2_Power')))
				{
					const stringPower = (hasData('PV1_Power') ? data.PV1_Power : 0) + (hasData('PV2_Power') ? data.PV2_Power : 0);
					stringsPlausible = Math.abs(stringPower - data.PV_Power) <= Math.max(data.PV_Power * 0.15, 100);
				}

				const setStringCapability = (capability, parameterName) =>
				{
					if (!hasData(parameterName))
					{
						return;
					}
					if (stringsPlausible)
					{
						this.setCapabilityValue(capability, data[parameterName]).catch(this.error);
					}
					else if (this.hasCapability(capability))
					{
						this.setCapabilityValue(capability, null).catch(this.error);
					}
				};

				if (this.sumPV1_PV2)
				{
					let totalPower = 0;
					let hasPower = false;

					if (hasData('PV1_Power'))
					{
						totalPower += data.PV1_Power;
						hasPower = true;
					}

					if (hasData('PV2_Power'))
					{
						totalPower += data.PV2_Power;
						hasPower = true;
					}

					if (hasPower)
					{
						this.setCapabilityValue('measure_power', totalPower).catch(this.error);
						this.homey.api.realtime('updateWidget', { deviceId: this.__id, capabilityID: 'measure_power', value: totalPower });
					}
				}
				else
				if (hasData('PV_Power'))
					{
						this.setCapabilityValue('measure_power', data.PV_Power).catch(this.error);
						this.homey.api.realtime('updateWidget', { deviceId: this.__id, capabilityID: 'measure_power', value: data.PV_Power });
					}

				if (this.hasCapability('meter_power.today') && hasData('Daily_Production'))
				{
					this.setCapabilityValue('meter_power.today', data.Daily_Production).catch(this.error);
					this.homey.api.realtime('updateWidget', { deviceId: this.__id, capabilityID: 'meter_power.today', value: data.Daily_Production });
				}

				if (this.hasCapability('meter_power') && hasData('Total_Generation') && data.Total_Generation > 0)
				{
					this.setCapabilityValue('meter_power', data.Total_Generation).catch(this.error);
				}

				setStringCapability('measure_power.pv1', 'PV1_Power');
				setStringCapability('measure_voltage.pv1', 'PV1_Voltage');
				setStringCapability('measure_current.pv1', 'PV1_Current');
				setStringCapability('measure_power.pv2', 'PV2_Power');
				setStringCapability('measure_voltage.pv2', 'PV2_Voltage');
				setStringCapability('measure_current.pv2', 'PV2_Current');

				if (this.hasCapability('measure_generation_time') && hasData('Generation_Time_Today'))
				{
					this.setCapabilityValue('measure_generation_time', data.Generation_Time_Today).catch(this.error);
				}
				if (this.hasCapability('measure_generation_time_total') && hasData('Generation_Time_Total'))
				{
					this.setCapabilityValue('measure_generation_time_total', data.Generation_Time_Total).catch(this.error);
				}
			}
		}
		catch (err)
		{
			this.homey.app.updateLog(`updateLanDeviceValues: : ${this.homey.app.varToString(err)}`);
			this.setUnavailable(err.message).catch(this.error);
		}
	}

}

module.exports = SolarPanelDevice;
