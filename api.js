'use strict';

module.exports = {
    async getLog({ homey })
    {
        return homey.app.diagLog;
    },
    async getDetect({ homey })
    {
        return homey.app.detectedDevices;
    },
    async clearLog({ homey })
    {
        homey.app.diagLog = '';
        return 'OK';
    },
    async sendLog({ homey, body })
    {
        return homey.app.sendLog(body);
    },
    async sendCmd({ homey, body })
    {
        const result = await homey.app.GetRegisterValue(body.command);
        return result;
    },
};
