var AWS = require('aws-sdk');
var fs = require('fs');
var uuidv4 = require('uuid/v4');
var childProcess = require("child_process");
var zipFolder = require('zip-folder');

// Creating AWS client
var s3 = new AWS.S3();

exports.handler = (event, context, callback) => {
  var saveFolder = uuidv4()
  fs.mkdir('./tmp/' + saveFolder, function(error) {
    if (error) throw error;
    s3.getObject({
      Bucket: 'qkvideo-dev-videos',
      Key: '1011/asset-92e3ed51-71e4-4a0a-826d-e488b4f16449/video.mp4'
    }, function(error, data) {
      if (error !== null) {
        console.log('Failure:', error)
      } else {
        var filePath = "./tmp/" + saveFolder

        console.log("Loaded " + data.ContentLength + " bytes");
        fs.writeFile(filePath + '/video.mp4', data.Body, function(error) {
          if (error) throw error;
          console.log('File saved!');

          var framesToExtract = event.framesToExtract.map(
            function(frame) {
              timeframe = parseInt(frame).toString()
              return timeframe.length === 1 ? "0" + timeframe : timeframe
            }
          );

          framesToExtract.forEach(function(frame) {
            childProcess.exec("ffmpeg -i " + filePath + "/video.mp4 -ss 00:00:" + frame + " -vframes 1 -f image2 '" + filePath + "/image" + Date.now() + ".jpg'",
              function (error, stdout, stderr) {
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
                if (error !== null) {
                  console.log('exec error: ' + error);
                }
              });
          });
        });
      }
    })
  })

  context.succeed("Yay :)");
}
