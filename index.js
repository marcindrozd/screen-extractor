var AWS = require('aws-sdk');
var fs = require('fs');
var uuidv4 = require('uuid/v4');

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

        console.log("Loaded " + data.ContentLength + " bytes");
        fs.writeFile('./tmp/' + saveFolder + '/video.mp4', data.Body, function(error) {
          if (error) throw error;
          console.log('File saved!')
        })
      }
    })
  })

  context.succeed("Yay :)");
}
