export const PANEL = Object.freeze({
	SOLAR: 1,
	POWER_GRID: 2,
	BATTERY: 3,
	HOME: 4,
	HOMEY: 5,
});

class Animation
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
	#flowFieldAnimation;
	#linkLineStartX;
	#linkLineStartY;
	#rotation;
	#flowToColour;
	#flowFromColour;

	constructor(ctx, width, height, Sector, imageFile)
	{
		this.#ctx = ctx;
		this.#width = width;
		this.#height = height;
		this.powerValue = 0;

		if (Sector === PANEL.SOLAR)
		{
			// Solar is the top left quadrant, so place the image at the top left corner, start the line below the image and end the line at the bottom right corner
			this.#imageX = 5;
			this.#imageY = 5;
			this.#lineStartX = this.#imageX + 35;
			this.#lineStartY = this.#imageY + 90;
			this.#lineEndX = width;
			this.#lineEndY = height - 5;
			this.#dotX = this.#lineStartX;
			this.#dotY = this.#lineStartY;
			this.#deltaX = (this.#lineEndX - this.#lineStartX) / 200;
			this.#deltaY = (this.#lineEndY - this.#lineStartY) / 200;
			this.#flowDirection = 1;
			this.#flowPolarity = 1;

			// Link line from image to main line
			this.#linkLineStartX = this.#imageX + 30;
			this.#linkLineStartY = this.#imageY + 51;
			this.#rotation = -1;
			this.#flowFromColour = '#20FF20';
		}
		else if (Sector === PANEL.POWER_GRID)
		{
			// Power Grid is the top right quadrant, so place the image at the top right corner, start the line below the image and end the line at the bottom left corner
			this.#imageX = width - 55;
			this.#imageY = 5;
			this.#lineStartX = this.#imageX + 20;
			this.#lineStartY = this.#imageY + 90;
			this.#lineEndX = 0;
			this.#lineEndY = height - 5;
			this.#dotX = this.#lineStartX;
			this.#dotY = this.#lineStartY;
			this.#deltaX = (this.#lineEndX - this.#lineStartX) / 200;
			this.#deltaY = (this.#lineEndY - this.#lineStartY) / 200;
			this.#flowDirection = 1;
			this.#flowPolarity = 1;

			// Link line from image to main line
			this.#linkLineStartX = this.#imageX + 25;
			this.#linkLineStartY = this.#imageY + 50;
			this.#rotation = -1;
			this.#flowFromColour = '#FF4500';
			this.#flowToColour = '#20FF20';
		}
		else if (Sector === PANEL.BATTERY)
		{
			// Battery is the bottom left quadrant, so place the image at the bottom left corner, start the line above the image and end the line at the top right corner
			this.#imageX = 5;
			this.#imageY = height - 55;
			this.#lineStartX = this.#imageX + 35;
			this.#lineStartY = this.#imageY - 40;
			this.#lineEndX = width;
			this.#lineEndY = 5;
			this.#dotX = this.#lineStartX;
			this.#dotY = this.#lineStartY;
			this.#deltaX = (this.#lineEndX - this.#lineStartX) / 200;
			this.#deltaY = (this.#lineEndY - this.#lineStartY) / 200;
			this.#flowDirection = 1;
			this.#flowPolarity = -1;

			// Link line from image to main line
			this.#linkLineStartX = this.#imageX + 25;
			this.#linkLineStartY = this.#imageY;
			this.#rotation = -1;
			this.#flowFromColour = '#FFFF00';
			this.#flowToColour = '#4169E1';
		}
		else if (Sector === PANEL.HOME)
		{
			// Home is the bottom right quadrant, so place the image at the bottom right corner, start the line at the top left corner and end the line above the image
			this.#imageX = width - 55;
			this.#imageY = height - 55;
			this.#lineStartX = 0;
			this.#lineStartY = 5;
			this.#lineEndX = this.#imageX + 20;
			this.#lineEndY = this.#imageY - 40;
			this.#dotX = this.#lineStartX;
			this.#dotY = this.#lineStartY;
			this.#deltaX = (this.#lineEndX - this.#lineStartX) / 200;
			this.#deltaY = (this.#lineEndY - this.#lineStartY) / 200;
			this.#flowDirection = -1;
			this.#flowPolarity = -1;

			// Link line from image to main line
			this.#linkLineStartX = this.#imageX + 25;
			this.#linkLineStartY = this.#imageY;
			this.#rotation = -1;
			this.#flowToColour = '#FFA500';
		}
		else if (Sector === PANEL.HOMEY)
		{
			// Homey is the static at the center of the screen, so place the image at the center of the screen
			this.#imageX = width / 2 - 25;
			this.#imageY = height / 2 - 25;
			this.#rotation = 0;
		}

		this.#img = new Image();
		this.#img.onload = function ()
		{
			this.#draw(this.#imageX, this.#imageY, 50, 50);
		}.bind(this);
		this.#img.src = imageFile;
	}

	#draw(x, y)
	{
		// Draw the image at the origin
		this.#ctx.drawImage(this.#img, this.#imageX, this.#imageY, 50, 50);

		this.#ctx.strokeStyle = '#4588f5';
		this.#ctx.lineWidth = 2;
		this.#ctx.jointStyle = 'round';

		let fillJoinLine = false;
		let sx;
		let sy;

		// Draw a line from the origin to the width and height
		this.#ctx.beginPath();
		if (this.#flowDirection < 0)
		{
			this.#ctx.moveTo(this.#lineStartX, this.#lineStartY);
			this.#ctx.lineTo(this.#lineEndX, this.#lineEndY);
			if (((this.#flowPolarity > 0) && (x > (this.#lineEndX - (this.#deltaX * 20)))) || ((this.#flowPolarity < 0) && (x > (this.#lineEndX - (this.#deltaX * 20)))))
			{
				fillJoinLine = true;
				sx = this.#lineEndX;
				sy = this.#lineEndY;
			}
		}
		else
		{
			this.#ctx.moveTo(this.#lineEndX, this.#lineEndY);
			this.#ctx.lineTo(this.#lineStartX, this.#lineStartY);
			if (this.#lineStartX < 50)
			{
				if (((this.#flowPolarity > 0) && (x < (this.#lineStartX + (this.#deltaX * 20)))) || ((this.#flowPolarity < 0) && (x < (this.#lineStartX + (this.#deltaX * 20)))))
				{
					fillJoinLine = true;
					sx = this.#lineStartX;
					sy = this.#lineStartY;
				}
			}
			else if (((this.#flowPolarity > 0) && (x > (this.#lineStartX + (this.#deltaX * 20)))) || ((this.#flowPolarity < 0) && (x < (this.#lineStartX + (this.#deltaX * 20)))))
			{
				fillJoinLine = true;
				sx = this.#lineStartX;
				sy = this.#lineStartY;
			}
		}
		this.#ctx.stroke();

		if ((this.powerValue !== 0) && fillJoinLine)
		{
			this.#ctx.beginPath();
			this.#ctx.moveTo(sx, sy);

			const gradient = this.#ctx.createLinearGradient(this.#linkLineStartX, this.#linkLineStartY, sx, sy);
			gradient.addColorStop(0, '#4588f5');
			gradient.addColorStop(1, (this.powerValue * this.#flowPolarity) > 0 ? this.#flowFromColour : this.#flowToColour);
			this.#ctx.strokeStyle = gradient;
		}

		// Draw a line from the image to the main line
		this.#ctx.lineTo(this.#linkLineStartX, this.#linkLineStartY);
		this.#ctx.stroke();

		if (this.powerValue !== 0)
		{
			// Draw a circle along the path
			this.#ctx.fillStyle = (this.powerValue * this.#flowPolarity) > 0 ? this.#flowFromColour : this.#flowToColour;
			this.#ctx.beginPath();
			this.#ctx.arc(x, y, 5, 0, 2 * Math.PI, false);
			this.#ctx.fill();
			if (!fillJoinLine)
			{
				this.#ctx.beginPath();
				this.#ctx.arc(x - this.#deltaX * 10, y - this.#deltaY * 10, 3, 0, 2 * Math.PI, false);
				this.#ctx.fill();
			}
		}

		if (this.chargeValue)
		{
			// Draw a rectangle in the battery image that is filled with the charge value
			if (this.chargeValue < 30)
			{
				// Fill red if charge is less than 30%
				this.#ctx.fillStyle = '#FF0000';
			}
			else if (this.chargeValue < 50)
			{
				// Fill orange if charge is less than 50%
				this.#ctx.fillStyle = '#FFA500';
			}
			else
			{
				// Fill green if charge is 50% or more
				this.#ctx.fillStyle = '#20FF20';
			}
			this.#ctx.beginPath();
			this.#ctx.roundRect(this.#imageX + 15, this.#imageY + 43, 20, (-this.chargeValue / 100) * 30, 2);
			this.#ctx.fill();
		}
	}

	drawImage()
	{
		if (this.#rotation >= 0)
		{
			this.#ctx.save();
			this.#ctx.translate(this.#imageX + 25, this.#imageY + 25);
			this.#ctx.rotate((this.#rotation * Math.PI) / 180);
			this.#ctx.drawImage(this.#img, -25, -25, 50, 50);
			this.#ctx.restore();

			this.#rotation += 1;
			if (this.#rotation >= 360)
			{
				this.#rotation = 0;
			}

			if ((this.powerValue > 2000) && (this.chargeValue > 90))
			{
				// Draw a green circle in the center of the image
				this.#ctx.beginPath();
				this.#ctx.arc(this.#imageX + 25, this.#imageY + 25, 10, 0, 2 * Math.PI, false);
				this.#ctx.fillStyle = '#20FF20';
				this.#ctx.fill();
			}
		}
		else
		{
			this.#ctx.drawImage(this.#img, this.#imageX, this.#imageY, 50, 50);
		}
	}

	animate()
	{
		this.#ctx.clearRect(0, 0, this.#width, this.#height);
		if (this.#rotation >= 0)
		{
			this.drawImage();
		}
		else
		{
			this.#draw(this.#dotX, this.#dotY);
			this.#dotX += this.#deltaX;
			this.#dotY += this.#deltaY;
			// If the dot has got to the end of the line then reset it to the start
			if ((this.#deltaX > 0 && this.#dotX >= this.#lineEndX) || (this.#deltaX < 0 && this.#dotX <= this.#lineEndX) || (this.#deltaY > 0 && this.#dotY >= this.#lineEndY) || (this.#deltaY < 0 && this.#dotY <= this.#lineEndY))
			{
				this.#dotX = this.#lineStartX;
				this.#dotY = this.#lineStartY;
			}
		}

		this.#flowFieldAnimation = requestAnimationFrame(this.animate.bind(this));
	}

	cancelAnimation()
	{
		cancelAnimationFrame(this.#flowFieldAnimation);
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

	setPowerValue(value)
	{
		if ((((value * this.#flowPolarity) < 0) && (this.#flowDirection > 0)) || (((value * this.#flowPolarity) > 0) && (this.#flowDirection < 0)))
		{
			this.reverse();
		}

		this.powerValue = value;
	}

	setChargeValue(value)
	{
		this.chargeValue = value;
	}

}

export { Animation };
