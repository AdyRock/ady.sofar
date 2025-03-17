'use strict';

const PANEL = Object.freeze({
    SOLAR: 1,
    POWER_GRID: 2,
    BATTERY: 3,
    HOME: 4,
    HOMEY: 5,
});

// Solar Panel
let canvasSolar;
let ctxSolar;
let flowFieldSolar;
let flowFieldSolarAnimation;

// Power Grid
let canvasGrid;
let ctxGrid;
let flowFieldGrid;
let flowFieldGridAnimation;

// Battery
let canvasBattery;
let ctxBattery;
let flowFieldBattery;
let flowFieldBatteryAnimation;

// Home
let canvasHome;
let ctxHome;
let flowFieldHome;
let flowFieldHomeAnimation;

// Homey
let canvasHomey;
let ctxHomey;
let flowFieldHomey;

function setupCanvases()
{
	// divide the screen into 4 quadrants
	const width = window.innerWidth / 2;
	const height = window.innerHeight / 2;

	const forecolor = window.getComputedStyle(document.body).getPropertyValue('--homey-text-color');

	// Solar Panel
	canvasSolar.width = width;
	canvasSolar.height = height;
	flowFieldSolar = new Entity(ctxSolar, width, height, PANEL.SOLAR, 'solar-panel.svg', forecolor);
	flowFieldSolar.animate();

	// Power Grid
	canvasGrid.width = width;
	canvasGrid.height = height;
	flowFieldGrid = new Entity(ctxGrid, width, height, PANEL.POWER_GRID, 'pylon.svg', forecolor);
	flowFieldGrid.animate();

	// Battery
	canvasBattery.width = width;
	canvasBattery.height = height;
	flowFieldBattery = new Entity(ctxBattery, width, height, PANEL.BATTERY, 'battery.svg', forecolor);
	flowFieldBattery.animate();

	// Home
	canvasHome.width = width;
	canvasHome.height = height;
	flowFieldHome = new Entity(ctxHome, width, height, PANEL.HOME, 'house.svg', forecolor);
	flowFieldHome.animate();

	// Homey
	canvasHomey.width = 50;
	canvasHomey.height = 50;
	flowFieldHomey = new Entity(ctxHomey, canvasHomey.width, canvasHomey.height, PANEL.HOMEY, 'homey-logo.png', forecolor);
	flowFieldHomey.drawImage();
}

window.onload = function()
{
	// divide the screen into 4 quadrants
	const width = `${window.innerWidth / 2}px`;
	const height = `${window.innerHeight / 2}px`;

	// Setup Solar Panel in top left of screen
	canvasSolar = document.getElementById('canvas1');
	canvasSolar.style.position = 'absolute';
	canvasSolar.style.top = '0px';
	canvasSolar.style.left = '0px';
	ctxSolar = canvasSolar.getContext('2d');

	// Setup Power Grid in top right of screen
	canvasGrid = document.getElementById('canvas2');
	canvasGrid.style.position = 'absolute';
	canvasGrid.style.top = '0px';
	canvasGrid.style.left = width;
	ctxGrid = canvasGrid.getContext('2d');

	// Setup Battery in bottom left of screen
	canvasBattery = document.getElementById('canvas3');
	canvasBattery.style.position = 'absolute';
	canvasBattery.style.top = height;
	canvasBattery.style.left = '0px';
	ctxBattery = canvasBattery.getContext('2d');

	// Setup Home in bottom right of screen
	canvasHome = document.getElementById('canvas4');
	canvasHome.style.position = 'absolute';
	canvasHome.style.top = height;
	canvasHome.style.left = width;
	ctxHome = canvasHome.getContext('2d');

	// Setup Homey in center of screen
	canvasHomey = document.getElementById('canvas5');
	canvasHomey.style.position = 'absolute';
	canvasHomey.style.top = `${window.innerHeight / 2 - 25}px`;
	canvasHomey.style.left = `${window.innerWidth / 2 - 25}px`;
	ctxHomey = canvasHomey.getContext('2d');

	setupCanvases();
};

window.addEventListener('resize', function()
{
	this.cancelAnimationFrame(flowFieldSolarAnimation);
	this.cancelAnimationFrame(flowFieldGridAnimation);
	this.cancelAnimationFrame(flowFieldBatteryAnimation);
	this.cancelAnimationFrame(flowFieldHomeAnimation);
	setupCanvases();
});

class Entity
{

	#ctx;
	#width;
	#height;
	#img;
	#imageX;
	#imageY;
	#lineStartX;
	#lineStartY;
	#lineEndX;
	#lineEndY;
	#dotX;
	#dotY;
	#deltaX;
	#deltaY;
	#flowDirection;
	#flowPolarity;
	#sideValue;
	#sideUnit;
	#endValue;
	#endUnit;
	#foreColor;

	constructor(ctx, width, height, Sector, imageFile, foreColor)
	{
		this.#ctx = ctx;
		this.#width = width;
		this.#height = height;
		this.#sideValue = 0;
		this.#endValue = null;
		this.#sideUnit = 'W';
		this.#endUnit = '';
		this.#foreColor = foreColor;

		if (Sector === PANEL.SOLAR)
		{
			// Solar is the top left quadrant, so place the image at the top left corner, start the line below the image and end the line at the bottom right corner
			this.#imageX = 5;
			this.#imageY = 5;
			this.#lineStartX = this.#imageX + 25;
			this.#lineStartY = this.#imageY + 55;
			this.#lineEndX = width;
			this.#lineEndY = height;
			this.#dotX = this.#lineStartX;
			this.#dotY = this.#lineStartY;
			this.#deltaX = (this.#lineEndX - this.#lineStartX) / 200;
			this.#deltaY = (this.#lineEndY - this.#lineStartY) / 200;
			this.#flowDirection = 1;
			this.#flowPolarity = 1;
		}
		else if (Sector === PANEL.POWER_GRID)
		{
			// Power Grid is the top right quadrant, so place the image at the top right corner, start the line below the image and end the line at the bottom left corner
			this.#imageX = width - 55;
			this.#imageY = 0;
			this.#lineStartX = this.#imageX + 25;
			this.#lineStartY = this.#imageY + 55;
			this.#lineEndX = 0;
			this.#lineEndY = height;
			this.#dotX = this.#lineStartX;
			this.#dotY = this.#lineStartY;
			this.#deltaX = (this.#lineEndX - this.#lineStartX) / 200;
			this.#deltaY = (this.#lineEndY - this.#lineStartY) / 200;
			this.#flowDirection = 1;
			this.#flowPolarity = 1;
		}
		else if (Sector === PANEL.BATTERY)
		{
			// Battery is the bottom left quadrant, so place the image at the bottom left corner, start the line above the image and end the line at the top right corner
			this.#imageX = 5;
			this.#imageY = height - 55;
			this.#lineStartX = this.#imageX + 25;
			this.#lineStartY = this.#imageY;
			this.#lineEndX = width;
			this.#lineEndY = 0;
			this.#dotX = this.#lineStartX;
			this.#dotY = this.#lineStartY;
			this.#deltaX = (this.#lineEndX - this.#lineStartX) / 200;
			this.#deltaY = (this.#lineEndY - this.#lineStartY) / 200;
			this.#flowDirection = 1;
			this.#flowPolarity = -1;

			this.#endValue = 70;
			this.#endUnit = '%';
		}
		else if (Sector === PANEL.HOME)
		{
			// Home is the bottom right quadrant, so place the image at the bottom right corner, start the line at the top left corner and end the line above the image
			this.#imageX = width - 55;
			this.#imageY = height - 55;
			this.#lineStartX = 0;
			this.#lineStartY = 0;
			this.#lineEndX = this.#imageX + 25;
			this.#lineEndY = this.#imageY;
			this.#dotX = this.#lineStartX;
			this.#dotY = this.#lineStartY;
			this.#deltaX = (this.#lineEndX - this.#lineStartX) / 200;
			this.#deltaY = (this.#lineEndY - this.#lineStartY) / 200;
			this.#flowDirection = -1;
			this.#flowPolarity = -1;
		}
		else if (Sector === PANEL.HOMEY)
		{
			// Homey is the static at the center of the screen, so place the image at the center of the screen
			this.#imageX = width / 2 - 25;
			this.#imageY = height / 2 - 25;
		}

		this.#img = new Image();
		this.#img.onload = function()
		{
			this.#draw(this.#imageX, this.#imageY, 50, 50);
		}.bind(this);
		this.#img.src = imageFile;
	}

	#draw(x, y)
	{
		// Draw the image at the origin
		this.#ctx.drawImage(this.#img, this.#imageX, this.#imageY, 50, 50);

		// Draw a line from the origin to the width and height
		this.#ctx.beginPath();
		this.#ctx.moveTo(this.#lineStartX, this.#lineStartY);
		this.#ctx.lineTo(this.#lineEndX, this.#lineEndY);
		this.#ctx.strokeStyle = '#2020FF';
		this.#ctx.lineWidth = 5;
		this.#ctx.stroke();

		if (this.#sideValue)
		{
			// Draw a circle along the path
			this.#ctx.beginPath();
			this.#ctx.arc(x, y, 5, 0, 2 * Math.PI, false);
			this.#ctx.fillStyle = '#20FF20';
			this.#ctx.fill();
			// this.#ctx.beginPath();
			// this.#ctx.arc(x - this.#deltaX * 7, y - this.#deltaY * 7, 3, 0, 2 * Math.PI, false);
			// this.#ctx.fillStyle = '#20FFFF';
			// this.#ctx.fill();
		}

		// Check if the side value is a number and draw it
		if (typeof this.#sideValue === 'number')
		{
			this.#ctx.font = '20px Arial';
			this.#ctx.fillStyle = this.#foreColor;
			const textHeight = this.#ctx.measureText(`${this.#sideValue}${this.#sideUnit}`).fontBoundingBoxAscent;

			// Draw the side value beside the image
			if (this.#imageX < 50)
			{
				// The image is on the left side of the screen so draw the value to the right of the image
				this.#ctx.fillText(`${this.#sideValue}${this.#sideUnit}`, this.#imageX + 50, (this.#imageY + 25) + (textHeight / 2));
			}
			else
			{
				// the image is on the right side of the screen so draw the value to the left of the image so work out the width of the text and subtract it from the x position
				const textWidth = this.#ctx.measureText(`${this.#sideValue}${this.#sideUnit}`).width;
				this.#ctx.fillText(`${this.#sideValue}${this.#sideUnit}`, this.#imageX - textWidth - 10, (this.#imageY + 25) + (textHeight / 2));
			}
		}

		// Check if the end value is a number and draw it
		if (typeof this.#endValue === 'number')
		{
			this.#ctx.font = '15px Arial';
			this.#ctx.fillStyle = this.#foreColor;
			const textHeight = this.#ctx.measureText(`${this.#sideValue}${this.#sideUnit}`).fontBoundingBoxAscent;

			if (this.#imageY > 50)
			{
				// The image is at the top of the screen so draw the value centered about the image width below the image so work out the width of the text and subtract it from the x position
				const textWidth = this.#ctx.measureText(`${this.#endValue}${this.#endUnit}`).width;
				this.#ctx.fillText(`${this.#endValue}${this.#endUnit}`, (this.#imageX + 25) - (textWidth / 2), this.#imageY + textHeight);
			}
			else
			{
				// The image is at the bottom of the screen so draw the value centered about the image width above the image so work out the width of the text and subtract it from the x position
				const textWidth = this.#ctx.measureText(`${this.#endValue}${this.#endUnit}`).width;
				this.#ctx.fillText(`${this.#endValue}${this.#endUnit}`, (this.#imageX + 25) - (textWidth / 2), this.#imageY - textHeight);
			}
		}
	}

	drawImage()
	{
		this.#ctx.drawImage(this.#img, this.#imageX, this.#imageY, 50, 50);
	}

	animate()
	{
		this.#ctx.clearRect(0, 0, this.#width, this.#height);
		this.#draw(this.#dotX, this.#dotY);
		this.#dotX += this.#deltaX;
		this.#dotY += this.#deltaY;
		// If the dot has got to the end of the line then reset it to the start
		if ((this.#deltaX > 0 && this.#dotX >= this.#lineEndX) || (this.#deltaX < 0 && this.#dotX <= this.#lineEndX) || (this.#deltaY > 0 && this.#dotY >= this.#lineEndY) || (this.#deltaY < 0 && this.#dotY <= this.#lineEndY))
		{
			this.#dotX = this.#lineStartX;
			this.#dotY = this.#lineStartY;
		}

		flowFieldSolarAnimation = requestAnimationFrame(this.animate.bind(this));
	}

	reverse()
	{
		this.#flowDirection *= -1;
		this.#deltaX *= -1;
		this.#deltaY *= -1;

		// Swap the start and end points
		let temp = this.#lineStartX;
		this.#lineStartX = this.#lineEndX;
		this.#lineEndX = temp;

		temp = this.#lineStartY;
		this.#lineStartY = this.#lineEndY;
		this.#lineEndY = temp;
	}

	setSideValue(value, unit)
	{
		if ((((value * this.#flowPolarity) < 0) && (this.#flowDirection > 0)) || (((value * this.#flowPolarity) > 0) && (this.#flowDirection < 0)))
		{
			this.reverse();
		}

		this.#sideValue = value;
		this.#sideUnit = unit;
	}

	setEndValue(value, unit)
	{
		this.#endValue = value;
		this.#endUnit = unit;
	}

}
