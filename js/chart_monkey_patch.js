Chart.Scale.prototype.draw = function(){
  this.xLabelRotation = 0;
  var ctx = this.ctx,
    yLabelGap = (this.endPoint - this.startPoint) / this.steps,
    xStart = Math.round(this.xScalePaddingLeft);
  if (this.display){
    ctx.fillStyle = this.textColor;
    ctx.font = this.font;
    Chart.helpers.each(this.yLabels,function(labelString,index){
      var yLabelCenter = this.endPoint - (yLabelGap * index),
        linePositionY = Math.round(yLabelCenter),
        drawHorizontalLine = this.showHorizontalLines;

      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      if (this.showLabels){
        ctx.fillText(labelString,xStart - 10,yLabelCenter);
      }

      // This is X axis, so draw it
      if (index === 0 && !drawHorizontalLine){
        drawHorizontalLine = true;
      }

      if (drawHorizontalLine){
        ctx.beginPath();
      }

      if (index > 0){
        // This is a grid line in the centre, so drop that
        ctx.lineWidth = this.gridLineWidth;
        ctx.strokeStyle = this.gridLineColor;
      } else {
        // This is the first line on the scale
        ctx.lineWidth = this.lineWidth;
        ctx.strokeStyle = this.lineColor;
      }

      linePositionY += Chart.helpers.aliasPixel(ctx.lineWidth);

      if(drawHorizontalLine){
        ctx.moveTo(xStart, linePositionY);
        ctx.lineTo(this.width, linePositionY);
        ctx.stroke();
        ctx.closePath();
      }

      ctx.lineWidth = this.lineWidth;
      ctx.strokeStyle = this.lineColor;
      ctx.beginPath();
      ctx.moveTo(xStart - 5, linePositionY);
      ctx.lineTo(xStart, linePositionY);
      ctx.stroke();
      ctx.closePath();

    },this);

    Chart.helpers.each(this.xLabels,function(label,index){
      if (label === null) { return; };

      var xPos = this.calculateX(index) + Chart.helpers.aliasPixel(this.lineWidth),
        // Check to see if line/bar here and decide where to place the line
        linePos = this.calculateX(index - (this.offsetGridLines ? 0.5 : 0)) + Chart.helpers.aliasPixel(this.lineWidth),
        isRotated = (this.xLabelRotation > 0),
        drawVerticalLine = this.showVerticalLines;

      if (label === '') {
        drawVerticalLine = true;
      } else {
        drawVerticalLine = false;
      }
      // This is Y axis, so draw it
      if (index === 0 && !drawVerticalLine){
        drawVerticalLine = true;
      }

      if (drawVerticalLine){
        ctx.beginPath();
      }

      if (index > 0){
        // This is a grid line in the centre, so drop that
        ctx.lineWidth = this.gridLineWidth;
        ctx.strokeStyle = this.gridLineColor;
      } else {
        // This is the first line on the scale
        ctx.lineWidth = this.lineWidth;
        ctx.strokeStyle = this.lineColor;
      }

      if (drawVerticalLine){
        ctx.moveTo(linePos,this.endPoint);
        ctx.lineTo(linePos,this.startPoint - 3);
        ctx.stroke();
        ctx.closePath();
      }


      ctx.lineWidth = this.lineWidth;
      ctx.strokeStyle = this.lineColor;


      // Small lines at the bottom of the base grid line
      if (drawVerticalLine){
        ctx.beginPath();
        ctx.moveTo(linePos,this.endPoint);
        ctx.lineTo(linePos,this.endPoint + 5);
        ctx.stroke();
        ctx.closePath();
      }

      ctx.save();
      ctx.translate(xPos,(isRotated) ? this.endPoint + 12 : this.endPoint + 8);
      ctx.rotate(Chart.helpers.radians(this.xLabelRotation)*-1);
      ctx.font = this.font;
      ctx.textAlign = (isRotated) ? "right" : "center";
      ctx.textBaseline = (isRotated) ? "middle" : "top";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    },this);

  }
};
