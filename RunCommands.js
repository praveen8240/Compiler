exports.runCommand = (compileCmd, runCmd, input, callback) => {
    if (compileCmd) {
      exec(compileCmd, (err, stdout, stderr) => {
        if (err) {
          callback(`Compilation error: ${stderr}`);
          return;
        }
        run(runCmd, input, callback);
      });
    } else {
      run(runCmd, input, callback);
    }
  };
  
  exports.run = (runCmd, input, callback) => {
    const childProcess = exec(runCmd, (err, stdout, stderr) => {
      if (err) {
        callback(`Execution error: ${stderr}`);
        return;
      }
      callback(stdout.trim());
    });
  
    if (typeof input === "number") {
      input = input.toString();
    }
  
    try {
      childProcess.stdin.write(input);
      childProcess.stdin.end();
    } catch (error) {
      callback(`Error writing to stdin: ${error.message}`);
    }
  };