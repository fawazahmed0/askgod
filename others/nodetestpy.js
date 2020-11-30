const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process');

// This will make the python 3 script run in multiple os environments
// https://stackoverflow.com/questions/20643470/execute-a-command-line-binary-with-node-js
// https://stackoverflow.com/a/35586247
// https://medium.com/swlh/run-python-script-from-node-js-and-send-data-to-browser-15677fcf199f
function runPyScript(pathToScript, args) {
    // Using windows py to run python version 3
    var output = spawnSync('py', ['-3', pathToScript].concat(args))
    // Using python3 binary to run python version 3, if above fails
    if (output.error)
      output = spawnSync('python3', [pathToScript].concat(args))
    // assuming python 3 is named as python in the system
    if (output.error)
      output = spawnSync('python', [pathToScript].concat(args))
    if (output.error)
      console.log("Either the translate script have failed or Python 3 might not be installed in the system")
  
    return output.stdout.toString();
  }
  

 val =  runPyScript('translateToMulti.py',['why is he fighting'])
 console.log(val)
 console.log(JSON.parse(val))