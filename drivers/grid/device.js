/* jslint node: true */

'use strict';

const LanDevice = require('../lan_device');

class GridDevice extends LanDevice
{

	/**
	 * onInit is called when the device is initialized.
	 */
	async onInit()
	{
		await super.onInit();

		this.startHour = this.getSetting('start_hour');
		this.startMin = this.getSetting('start_minute');
		this.endHour = this.getSetting('end_hour');
		this.endMin = this.getSetting('end_minute');

		if (this.getSetting('export') === undefined)
		{
			this.setSettings({
				export: 0,
			});
		}

		if (this.hasCapability('meter_power.today_import'))
		{
			if (!this.hasCapability('meter_cost.today_import') && (this.getSetting('standard') > 0))
			{
				// Add the missing standard cost capability
				await this.addCapabilitySafe('meter_cost.today_import');
			}

			if (this.getSetting('dual_rate'))
			{
				if (!this.hasCapability('meter_power.hi_rate_import') && (this.getSetting('lo') > 0))
				{
					await this.addCapabilitySafe('meter_power.hi_rate_import');
					await this.addCapabilitySafe('meter_cost.hi_rate_import');
					await this.addCapabilitySafe('meter_power.low_rate_import');
					await this.addCapabilitySafe('meter_cost.low_rate_import');
				}
			}
		}

		if (this.hasCapability('meter_cost.today_export') && (this.getSetting('export') === 0))
		{
			await this.removeCapabilitySafe('meter_cost.today_export');
			await this.removeCapabilitySafe('meter_cost.today_total');
		}

		this.startPower = this.getStoreValue('startPower');
		this.endPower = this.getStoreValue('endPower');
		if (!this.startPower)
		{
			this.startPower = 0;
		}
		if (!this.endPower)
		{
			this.endPower = 0;
		}

		this.log('GridDevice has been initialized');
	}

	async onSettings({ oldSettings, newSettings, changedKeys })
	{
		if (changedKeys.indexOf('dual_rate') >= 0)
		{
			if (newSettings.dual_rate)
			{
				if (this.hasCapability('meter_power.today_import'))
				{
					await this.addCapabilitySafe('meter_power.hi_rate_import');
					await this.addCapabilitySafe('meter_cost.hi_rate_import');
					await this.addCapabilitySafe('meter_power.low_rate_import');
					await this.addCapabilitySafe('meter_cost.low_rate_import');
				}
			}
			else
			{
				await this.removeCapabilitySafe('meter_power.hi_rate_import');
				await this.removeCapabilitySafe('meter_cost.hi_rate_import');
				await this.removeCapabilitySafe('meter_power.low_rate_import');
				await this.removeCapabilitySafe('meter_cost.low_rate_import');
			}
		}

		if (changedKeys.indexOf('start_hour') >= 0)
		{
			this.startHour = newSettings.start_hour;
		}
		if (changedKeys.indexOf('startMin') >= 0)
		{
			this.startMin = newSettings.start_minute;
		}
		if (changedKeys.indexOf('endHour') >= 0)
		{
			this.endHour = newSettings.end_hour;
		}
		if (changedKeys.indexOf('endMin') >= 0)
		{
			this.endMin = newSettings.end_minute;
		}
		if (changedKeys.indexOf('export') >= 0)
		{
			await this.addCapabilitySafe('meter_cost.today_export');
			await this.addCapabilitySafe('meter_cost.today_total');
		}
		else
		{
			await this.removeCapabilitySafe('meter_cost.today_export');
			await this.removeCapabilitySafe('meter_cost.today_total');
		}

		if (changedKeys.indexOf('cost_units') >= 0)
		{
			// Update the of all the cost capabilities
			if (this.hasCapability('meter_cost.today_import'))
			{
				const options = this.getCapabilityOptions('meter_cost.today_import');
				if (this.options)
				{
					options.units = newSettings.cost_units;
					await this.setCapabilityOptionsSafe('meter_cost.today_import', options);
				}
			}

			if (this.hasCapability('meter_cost.hi_rate_import'))
			{
				const options = this.getCapabilityOptions('meter_cost.hi_rate_import');
				if (this.options)
				{
					options.units = newSettings.cost_units;
					await this.setCapabilityOptionsSafe('meter_cost.hi_rate_import', options);
				}
			}

			if (this.hasCapability('meter_cost.low_rate_import'))
			{
				const options = this.getCapabilityOptions('meter_cost.low_rate_import');
				if (this.options)
				{
					options.units = newSettings.cost_units;
					await this.setCapabilityOptionsSafe('meter_cost.low_rate_import', options);
				}
			}

			if (this.hasCapability('meter_cost.today_export'))
			{
				const options = this.getCapabilityOptions('meter_cost.today_export');
				if (this.options)
				{
					options.units = newSettings.cost_units;
					await this.setCapabilityOptionsSafe('meter_cost.today_export', options);
				}
			}

			if (this.hasCapability('meter_cost.today_total'))
			{
				const options = this.getCapabilityOptions('meter_cost.today_total');
				if (this.options)
				{
					options.units = newSettings.cost_units;
					await this.setCapabilityOptionsSafe('meter_cost.today_total', options);
				}
			}
		}
	}

	async checkCapabilities(serial)
	{
		const inverter = this.homey.app.getInverter(serial);
		if (inverter)
		{
			// get the 'grid' group from the parameter definitions in the inverter
			const group = inverter.inverter.parameter_definition.parameters.find((group) => group.group === 'grid');
			if (group)
			{
				// Set this to avoid checking again until next device initialization, but it will be cleared if a parameter is missing and we have to check again
				this.CapabilitiesChecked = true;

				// Check for each capability if the parameter exists
				if (this.getSetting('dual_rate'))
				{
					await this.addRemoveCapability(['meter_power.today_import', 'meter_power.hi_rate_import', 'meter_power.low_rate_import', 'meter_cost.today_import', 'meter_cost.hi_rate_import', 'meter_cost.low_rate_import'], group.items, 'Import_Today');
				}
				else
				{
					await this.addRemoveCapability(['meter_power.today_import', 'meter_cost.today_import'], group.items, 'Import_Today');

					// Make sure the dual rate capabilities are removed
					await this.removeCapabilitySafe('meter_power.hi_rate_import');
					await this.removeCapabilitySafe('meter_power.low_rate_import');
					await this.removeCapabilitySafe('meter_cost.hi_rate_import');
					await this.removeCapabilitySafe('meter_cost.low_rate_import');
				}

				// Check for export capabilities
				await this.addRemoveCapability(['meter_power.today_export', 'meter_cost.today_export', 'meter_cost.today_total'], group.items, 'Export_Today');

				// Total import/export capabilities
				await this.addRemoveCapability(['meter_power.total_import'], group.items, 'Total_Import');

				await this.addRemoveCapability(['meter_power.total_export'], group.items, 'Total_Export');
			}
		}
	}

	convertTZ(date, tzString)
	{
		return new Date((typeof date === 'string' ? new Date(date) : date).toLocaleString('en-US', { timeZone: tzString }));
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
				}

				this.setAvailable();

				if (hasData('Grid_Power'))
				{
					this.setCapabilityValue('measure_power', -data.Grid_Power).catch(this.error);
					this.homey.api.realtime('updateWidget', { deviceId: this.__id, capabilityID: 'measure_power', value: -data.Grid_Power });
				}

				// Check for voltage on the grid first as some inverters have multiple voltage parameters but not all of them are populated so we want to use the one that is populated
				if (hasData('Grid_Voltage'))
				{
					this.setCapabilityValue('measure_voltage', data.Grid_Voltage).catch(this.error);
				}
				else if (hasData('Grid_Voltage_L1'))
				{
					this.setCapabilityValue('measure_voltage', data.Grid_Voltage_L1).catch(this.error);
					if (hasData('Grid_Voltage_L2'))
					{
						if (!this.hasCapability('measure_voltage.L2'))
						{
							await this.addCapabilitySafe('measure_voltage.L2');
						}
						this.setCapabilityValue('measure_voltage.L2', data.Grid_Voltage_L2).catch(this.error);
					}
				}
				else if (hasData('Grid_Voltage1'))
				{
					this.setCapabilityValue('measure_voltage', data.Grid_Voltage1).catch(this.error);
					if (hasData('Grid_Voltage2'))
					{
						if (!this.hasCapability('measure_voltage.L2'))
						{
							await this.addCapabilitySafe('measure_voltage.L2');
						}
						this.setCapabilityValue('measure_voltage.L2', data.Grid_Voltage2).catch(this.error);
					}
					if (hasData('Grid_Voltage3'))
					{
						if (!this.hasCapability('measure_voltage.L3'))
						{
							await this.addCapabilitySafe('measure_voltage.L3');
						}
						this.setCapabilityValue('measure_voltage.L3', data.Grid_Voltage3).catch(this.error);
					}
				}

				if (hasData('Grid_Current'))
				{
					this.setCapabilityValue('measure_current', data.Grid_Current).catch(this.error);
				}
				else if (hasData('Grid_Current1'))
				{
					this.setCapabilityValue('measure_current', data.Grid_Current1).catch(this.error);
					if (hasData('Grid_Current2'))
					{
						if (!this.hasCapability('measure_current.L2'))
						{
							await this.addCapabilitySafe('measure_current.L2');
						}
						this.setCapabilityValue('measure_current.L2', data.Grid_Current2).catch(this.error);
					}
					if (hasData('Grid_Current3'))
					{
						if (!this.hasCapability('measure_current.L3'))
						{
							await this.addCapabilitySafe('measure_current.L3');
						}
						this.setCapabilityValue('measure_current.L3', data.Grid_Current3).catch(this.error);
					}
				}

				if (hasData('Grid_Frequency'))
				{
					this.setCapabilityValue('measure_frequency', data.Grid_Frequency).catch(this.error);
				}

				// Import with cost and dual rate option
				if (this.hasCapability('meter_power.today_import') && hasData('Import_Today') && (data.Import_Today > 0))
				{
					this.setCapabilityValue('meter_power.today_import', data.Import_Today).catch(this.error);
					this.homey.api.realtime('updateWidget', { deviceId: this.__id, capabilityID: 'meter_power.today_import', value: data.Import_Today });

					if (this.getSetting('dual_rate'))
					{
						// Dual rate enabled. Get date in local time
						const tz = this.homey.clock.getTimezone();
						const nowTime = this.convertTZ(new Date(), tz);
						let standardCost = 0;
						let lowCost = 0;
						const nowHour = nowTime.getHours();
						const nowMinute = nowTime.getMinutes();

						if ((nowHour < this.startHour) || ((nowHour === this.startHour) && (nowMinute < this.startMin)))
						{
							// Before the low rate period so just record import power up to start
							if (this.startPower !== data.Import_Today)
							{
								this.startPower = data.Import_Today;
								this.setStoreValue('startPower', this.startPower);

								const unitPrice = this.getSetting('standard');
								if (unitPrice > 0)
								{
									standardCost = this.startPower * unitPrice;
									this.setCapabilityValue('meter_cost.today_import', standardCost).catch(this.error);
								}

								if (this.endPower > 0)
								{
									this.endPower = 0;
									this.setStoreValue('endPower', this.endPower);
									this.setCapabilityValue('meter_power.low_rate_import', 0).catch(this.error);
									this.setCapabilityValue('meter_cost.low_rate_import', 0).catch(this.error);
								}
							}
						}
						else if ((nowHour < this.endHour) || ((nowHour === this.endHour) && (nowMinute < this.endMin)))
						{
							// In the low rate period
							if ((this.startHour === 0) && (this.startMin === 0) && (this.startPower !== 0))
							{
								// Trap for low rate starting a midnight to clear startPower
								this.startPower = 0;
								this.setStoreValue('startPower', this.startPower);
								this.setCapabilityValue('meter_cost.hi_rate_import', 0).catch(this.error);
								this.setCapabilityValue('meter_power.hi_rate_import', 0).catch(this.error);
							}

							if (this.endPower !== data.Import_Today)
							{
								// Power has updated so update the end power then we know how much was used during the low rate
								this.endPower = data.Import_Today;
								this.setStoreValue('endPower', this.endPower);

								const lowToday = this.endPower - this.startPower;
								this.setCapabilityValue('meter_power.low_rate_import', lowToday).catch(this.error);
								const unitPrice = this.getSetting('lo');
								if (unitPrice > 0)
								{
									lowCost = lowToday * unitPrice;
									this.setCapabilityValue('meter_cost.low_rate_import', lowCost).catch(this.error);

									// Total cost for dual tarrif is cost at low rate + cost at standard rate
									this.setCapabilityValue('meter_cost.today_import', standardCost + lowCost).catch(this.error);
								}
							}
						}
//                        else
						{
							// After low rate period
							const standardToday = data.Import_Today - (this.endPower - this.startPower);
							this.setCapabilityValue('meter_power.hi_rate_import', standardToday).catch(this.error);
							const unitPrice = this.getSetting('standard');
							if (unitPrice > 0)
							{
								standardCost = standardToday * unitPrice;
								this.setCapabilityValue('meter_cost.hi_rate_import', standardCost).catch(this.error);
							}

							if (lowCost === 0)
							{
								const lowToday = this.endPower - this.startPower;
								this.setCapabilityValue('meter_power.low_rate_import', lowToday).catch(this.error);
								const unitPrice = this.getSetting('lo');
								if (unitPrice > 0)
								{
									lowCost = lowToday * unitPrice;
									this.setCapabilityValue('meter_cost.low_rate_import', lowCost).catch(this.error);

									// Total cost for dual tarrif is cost at low rate + cost at standard rate
									this.setCapabilityValue('meter_cost.today_import', standardCost + lowCost).catch(this.error);
								}
							}
						}
					}
					else
					{
						// Not using dual rate tarrif so cost is  total * standard rate
						this.setCapabilityValue('meter_cost.today_import', data.Import_Today * this.getSetting('standard')).catch(this.error);
					}
				}

				if (this.hasCapability('meter_power.today_export') && hasData('Export_Today') && data.Export_Today > 0)
				{
					this.setCapabilityValue('meter_power.today_export', data.Export_Today).catch(this.error);

					if (this.hasCapability('meter_cost.today_export'))
					{
						const exportPrice = this.getSetting('export');
						if (exportPrice > 0)
						{
							// Export cost is -(export today * export rate)
							const exportCost = -(data.Export_Today * exportPrice);
							this.setCapabilityValue('meter_cost.today_export', exportCost).catch(this.error);

							const totalCost = this.getCapabilityValue('meter_cost.today_import') + exportCost;
							this.setCapabilityValue('meter_cost.today_total', totalCost).catch(this.error);
						}
					}
				}
				if (this.hasCapability('meter_power.total_import') && hasData('Total_Import') && data.Total_Import > 0)
				{
					this.setCapabilityValue('meter_power.total_import', data.Total_Import).catch(this.error);
				}
				if (this.hasCapability('meter_power.total_export') && hasData('Total_Export') && data.Total_Export > 0)
				{
					this.setCapabilityValue('meter_power.total_export', data.Total_Export).catch(this.error);
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

module.exports = GridDevice;
