/* jslint node: true */

'use strict';

const LanDriver = require('../lan_driver');

class InverterDriver extends LanDriver
{

    /**
     * onOAuth2Init is called when the driver is initialized.
     */
    async onInit()
    {
        super.onInit();
        this.log('InverterDriver has been initialized');
    }

    /**
     * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
     * This should return an array with the data of devices that are available for pairing.
     */
    async onPairListDevices()
    {
        return this.getLanDevices('inverter');
    }

}

module.exports = InverterDriver;
