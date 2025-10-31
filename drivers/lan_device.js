/* jslint node: true */

'use strict';

const { Device } = require('homey');

class LanDevice extends Device
{

	async onInit()
	{
		try
		{
			await super.onInit();
			this.CapabilitiesChecked = false;
			await this.homey.app.startLocalFetch();
		}
		catch (err)
		{
			this.log(err);
		}
	}

	/**
	 * onDeleted is called when the user deleted the device.
	 */
	async onDeleted()
	{
		// this.homey.app.unregisterHUBPolling();

		this.log('LanDevice has been deleted');
	}

	/**
	 * onSettings is called when the user updates the device's settings.
	 * @param {object} event the onSettings event data
	 * @param {object} event.oldSettings The old settings object
	 * @param {object} event.newSettings The new settings object
	 * @param {string[]} event.changedKeys An array of keys changed since the previous version
	 * @returns {Promise<string|void>} return a custom message that will be displayed
	 */
	async onSettings({ oldSettings, newSettings, changedKeys })
	{
		// Called when settings changed
	}

	async addCapabilitySafe(capability)
	{
		try
		{
			if (!this.hasCapability(capability))
			{
				await this.addCapability(capability);
			}
		}
		catch (error)
		{
			this.error(`addCapabilitySafe: ${error}`);
		}
	}

	async removeCapabilitySafe(capability)
	{
		try
		{
			if (this.hasCapability(capability))
			{
				await this.removeCapability(capability);
			}
		}
		catch (error)
		{
			this.error(`removeCapabilitySafe: ${error}`);
		}
	}

	async setCapabilityOptionsSafeSafe(capability, value)
	{
		try
		{
			await this.setCapabilityOptionsSafe(capability, value);
		}
		catch (error)
		{
			this.error(`setCapabilityOptionsSafeSafe: ${error}`);
		}
	}

	async addRemoveCapability(capability, items, parameterName)
	{
		// Check if this capability has already been found once before
		if (this.capabilityFound && this.capabilityFound[capability[0]])
		{
			return;
		}

		// Check if the parameter exists in the item.name list
		if (items.map((item) => item.name).includes(parameterName))
		{
			// Add all the capabilities in the array
			for (const cap of capability)
			{
				await this.addCapabilitySafe(cap);
			}

			// Mark this capability as found
			if (!this.capabilityFound)
			{
				this.capabilityFound = {};
			}
			this.capabilityFound[capability[0]] = true;
		}
		else if (this.hasCapability(capability[0]))
		{
			// We don't want to remove capabilities immediately as the missing parameter may just be temporarily unavailable, so keep a count of misses
			if (!this.capabilityMisses)
			{
				this.capabilityMisses = {};
			}

			if (!this.capabilityMisses[capability[0]])
			{
				this.capabilityMisses[capability[0]] = 1;
			}
			else
			{
				this.capabilityMisses[capability[0]]++;
			}

			if (this.capabilityMisses[capability[0]] < 5)
			{
				// Not yet reached the miss threshold so make sure we come back here next time
				this.CapabilitiesChecked = false;

				// Not enough misses yet
				return;
			}

			// Remove all the capabilities in the array
			for (const cap of capability)
			{
				await this.removeCapabilitySafe(cap);
			}
		}
	}

}

module.exports = LanDevice;
