import { Animation, PANEL } from './animation.js';
import { TextFields } from './textFields.js';

// Solar Panel
let canvasSolar;
let ctxSolar;
let flowFieldSolar;

// Power Grid
let canvasGrid;
let ctxGrid;
let flowFieldGrid;

// Battery
let canvasBattery;
let ctxBattery;
let flowFieldBattery;

// Home
let canvasHome;
let ctxHome;
let flowFieldHome;

// Homey
let canvasHomey;
let ctxHomey;
let flowFieldHomey;

let canvasSolarText;
let ctxSolarText;
let flowFieldSolarText;

let canvasGridText;
let ctxGridText;
let flowFieldGridText;

let canvasBatteryText;
let ctxBatteryText;
let flowFieldBatteryText;

let canvasHomeText;
let ctxHomeText;
let flowFieldHomeText;

function setupCanvases()
{
	// divide the screen into 4 quadrants
	const width = window.innerWidth / 2;
	const height = window.innerHeight / 2;

	const forecolor = window.getComputedStyle(document.body).getPropertyValue('--homey-text-color');

	// Setup Solar Panel in top left of screen
	canvasSolar = document.getElementById('canvas1');
	canvasSolar.style.position = 'absolute';
	canvasSolar.style.top = '0px';
	canvasSolar.style.left = '0px';
	canvasSolar.style.right = `${width}px`;
	canvasSolar.style.bottom = `${height}px`;
	ctxSolar = canvasSolar.getContext('2d');
	canvasSolar.width = width;
	canvasSolar.height = height;
	flowFieldSolar = new Animation(ctxSolar, width, height, PANEL.SOLAR, 'solar-panel.svg', forecolor);
	flowFieldSolar.animate();
	// Make flowFieldSolar globally accessible
	window.flowFieldSolar = flowFieldSolar;

	// Setup Power Grid in top right of screen
	canvasGrid = document.getElementById('canvas2');
	canvasGrid.style.position = 'absolute';
	canvasGrid.style.top = '0px';
	canvasGrid.style.left = `${width}px`;
	canvasGrid.style.right = `${width * 2}px`;
	canvasGrid.style.bottom = `${height}px`;
	ctxGrid = canvasGrid.getContext('2d');
	canvasGrid.width = width;
	canvasGrid.height = height;
	flowFieldGrid = new Animation(ctxGrid, width, height, PANEL.POWER_GRID, 'pylon.svg', forecolor);
	flowFieldGrid.animate();
	// make flowFieldGrid globally accessible
	window.flowFieldGrid = flowFieldGrid;

	// Setup Battery in bottom left of screen
	canvasBattery = document.getElementById('canvas3');
	canvasBattery.style.position = 'absolute';
	canvasBattery.style.top = `${height}px`;
	canvasBattery.style.left = '0px';
	canvasBattery.style.right = `${width}px`;
	canvasBattery.style.bottom = `${height * 2}px`;
	ctxBattery = canvasBattery.getContext('2d');
	canvasBattery.width = width;
	canvasBattery.height = height;
	flowFieldBattery = new Animation(ctxBattery, width, height, PANEL.BATTERY, 'battery.svg', forecolor);
	flowFieldBattery.animate();
	// make flowFieldBattery globally accessible
	window.flowFieldBattery = flowFieldBattery;

	// Setup Home in bottom right of screen
	canvasHome = document.getElementById('canvas4');
	canvasHome.style.position = 'absolute';
	canvasHome.style.top = `${height}px`;
	canvasHome.style.left = `${width}px`;
	canvasHome.style.right = `${width * 2}px`;
	canvasHome.style.bottom = `${height * 2}px`;
	ctxHome = canvasHome.getContext('2d');
	canvasHome.width = width;
	canvasHome.height = height;
	flowFieldHome = new Animation(ctxHome, width, height, PANEL.HOME, 'house.svg', forecolor);
	flowFieldHome.animate();
	// make flowFieldHome globally accessible
	window.flowFieldHome = flowFieldHome;

	// Setup Homey in center of screen
	canvasHomey = document.getElementById('canvas5');
	canvasHomey.style.position = 'absolute';
	canvasHomey.style.top = `${window.innerHeight / 2 - 25}px`;
	canvasHomey.style.left = `${window.innerWidth / 2 - 25}px`;
	canvasHomey.style.right = `${window.innerWidth / 2 + 25}px`;
	canvasHomey.style.bottom = `${window.innerHeight / 2 + 25}px`;
	// canvasHomey.style.background = window.getComputedStyle(document.body).getPropertyValue('--homey-background-color');
	ctxHomey = canvasHomey.getContext('2d');
	canvasHomey.width = 50;
	canvasHomey.height = 50;
	flowFieldHomey = new Animation(ctxHomey, canvasHomey.width, canvasHomey.height, PANEL.HOMEY, 'homey-logo.png', forecolor);
	flowFieldHomey.animate();
	// Make flowFieldHomey globally accessible
	window.flowFieldHomey = flowFieldHomey;

	// Create text overlay for solar panel
	canvasSolarText = document.getElementById('canvas6');
	canvasSolarText.style.position = 'absolute';
	canvasSolarText.style.top = '0px';
	canvasSolarText.style.left = '0px';
	canvasSolarText.style.right = `${width}px`;
	canvasSolarText.style.bottom = `${height}px`;
	ctxSolarText = canvasSolarText.getContext('2d');
	canvasSolarText.width = width;
	canvasSolarText.height = height;
	if (!flowFieldSolarText)
	{
		flowFieldSolarText = new TextFields(ctxSolarText, 55, 0, true, forecolor, -1);
		// Make flowFieldSolarText globally accessible
		window.flowFieldSolarText = flowFieldSolarText;
	}
	else
	{
		flowFieldSolarText.setXY(55, 0);
	}

	// Create text overlay for battery
	canvasBatteryText = document.getElementById('canvas7');
	canvasBatteryText.style.position = 'absolute';
	canvasBatteryText.style.top = `${height}px`;
	canvasBatteryText.style.left = '0px';
	canvasBatteryText.style.right = `${width}px`;
	canvasBatteryText.style.bottom = `${height * 2}px`;
	ctxBatteryText = canvasBatteryText.getContext('2d');
	canvasBatteryText.width = width;
	canvasBatteryText.height = height;

	if (!flowFieldBatteryText)
	{
		flowFieldBatteryText = new TextFields(ctxBatteryText, 55, height - 80, true, forecolor, 1);
		// Make flowFieldBatteryText globally accessible
		window.flowFieldBatteryText = flowFieldBatteryText;
	}
	else
	{
		flowFieldBatteryText.setXY(55, height - 80);
	}

	// Create text overlay for power grid
	canvasGridText = document.getElementById('canvas8');
	canvasGridText.style.position = 'absolute';
	canvasGridText.style.top = '0px';
	canvasGridText.style.left = `${width}px`;
	canvasGridText.style.right = `${width * 2}px`;
	canvasGridText.style.bottom = `${height}px`;
	ctxGridText = canvasGridText.getContext('2d');
	canvasGridText.width = width;
	canvasGridText.height = height;

	if (!flowFieldGridText)
	{
		flowFieldGridText = new TextFields(ctxGridText, width - 80, 0, false, forecolor, -1);
		// Make flowFieldGridText globally accessible
		window.flowFieldGridText = flowFieldGridText;
	}
	else
	{
		flowFieldGridText.setXY(width - 80, 0);
	}

	// Create text overlay for home
	canvasHomeText = document.getElementById('canvas9');
	canvasHomeText.style.position = 'absolute';
	canvasHomeText.style.top = `${height}px`;
	canvasHomeText.style.left = `${width}px`;
	canvasHomeText.style.right = `${width * 2}px`;
	canvasHomeText.style.bottom = `${height * 2}px`;
	ctxHomeText = canvasHomeText.getContext('2d');
	canvasHomeText.width = width;
	canvasHomeText.height = height;

	if (!flowFieldHomeText)
	{
		flowFieldHomeText = new TextFields(ctxHomeText, width - 80, height - 80, false, forecolor, 1);
		// Make flowFieldHomeText globally accessible
		window.flowFieldHomeText = flowFieldHomeText;
	}
	else
	{
		flowFieldHomeText.setXY(width - 80, height - 80);
	}
}


window.onload = function ()
{
	setupCanvases();
};

window.addEventListener('resize', function ()
{
	flowFieldSolar.cancelAnimation();
	flowFieldGrid.cancelAnimation();
	flowFieldBattery.cancelAnimation();
	flowFieldHome.cancelAnimation();
	flowFieldHomey.cancelAnimation();
	setupCanvases();
});
