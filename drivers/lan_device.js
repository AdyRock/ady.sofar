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

}

module.exports = LanDevice;
