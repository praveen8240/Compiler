const express = require("express");
const bodyParser = require("body-parser");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
    methods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
    allowedHeaders: "Content-Type,Authorization",
  })
);
const PORT = 7777;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.get("/", (req, res) => {
  // res.render("index");
});

const generateUniqueFileName = (baseName, extension) => {
  return `${baseName}_${uuidv4()}${extension}`;
};

const cleanupFiles = (filePath, outputFile) => {
  // Delete the source file
  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error(`Error deleting file: ${filePath}`);
    });
  }

  // Delete the output files if any
  if (outputFile) {
    const outputExtensions = [".class", ""]; // Add other extensions as needed
    outputExtensions.forEach((ext) => {
      const fileToDelete = outputFile + ext;
      if (fs.existsSync(fileToDelete)) {
        fs.unlink(fileToDelete, (err) => {
          if (err) console.error(`Error deleting file: ${fileToDelete}`);
        });
      }
    });
  }
};

const runCommand = (compileCmd, runCmd, input, callback) => {
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

const run = (runCmd, input, callback) => {
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

const compileAndRun = (
  compileCmd,
  runCmd,
  inputs,
  res,
  filePath,
  outputFile
) => {
  let results = new Array(inputs.length);
  let completed = 0;

  inputs.forEach((input, index) => {
    runCommand(compileCmd, runCmd, input, (result) => {
      results[index] = { input: input, output: result }; // Ensure the output is stored in the correct order
      completed++;
      if (completed === inputs.length) {
        // Ensure cleanup is done after all inputs have been processed
        setTimeout(() => {
          cleanupFiles(filePath, outputFile);
          res.json(results);
        }, 100); // Small delay to ensure cleanup happens after all outputs are processed
      }
    });
  });
};

app.post("/run-code", (req, res) => {
  try{
  let { code, fileExtension, inputs } = req.body;
  //   console.log("code: " + code);
  // Validate inputs
  if (!code || !fileExtension || !Array.isArray(inputs)) {
    return res.status(400).send("Invalid input format");
  }
  const escapeNewLinesInDoubleQuotes = (text) => {
    return text.replace(/"[^"]*?\n[^"]*?"/g, (match) => match.replace(/\n/g, '\\n'));
  };

  // Escape \n in double-quoted strings
  code = escapeNewLinesInDoubleQuotes(code);

  // Handle public class declarations
  if (fileExtension === ".java") {
    code = code.replace(/public\s+class\s+(\w+)/g, "class $1");
  }


  let fileNameWithoutExt = "tempfile";
  if (fileExtension === ".java") {
    const classNameMatch = code.match(/class\s+(\w+)/);
    if (classNameMatch && classNameMatch[1]) {
      fileNameWithoutExt = classNameMatch[1];
    }
  }

  const fileName = generateUniqueFileName(fileNameWithoutExt, fileExtension);
  const filePath = path.join(__dirname, fileName);
  const outputFile = path.join(__dirname, fileNameWithoutExt);

  fs.writeFile(filePath, code, (err) => {
    if (err) {
      return res.status(500).send("Error writing file");
    }

    switch (fileExtension) {
      case ".java":
        const javaCompileCmd = `javac ${filePath}`;
        const javaRunCmd = `java -cp ${path.dirname(
          filePath
        )} ${fileNameWithoutExt}`;
        compileAndRun(
          javaCompileCmd,
          javaRunCmd,
          inputs,
          res,
          filePath,
          outputFile
        );
        break;

      case ".py":
        const pythonRunCmd = `python ${filePath}`;
        compileAndRun(null, pythonRunCmd, inputs, res, filePath);
        break;

      case ".c":
        const cCompileCmd = `gcc ${filePath} -o ${outputFile}`;
        const cRunCmd = `./${fileNameWithoutExt}`;
        compileAndRun(cCompileCmd, cRunCmd, inputs, res, filePath, outputFile);
        break;

      case ".cpp":
        const cppCompileCmd = `g++ ${filePath} -o ${outputFile}`;
        const cppRunCmd = `./${fileNameWithoutExt}`;
        compileAndRun(
          cppCompileCmd,
          cppRunCmd,
          inputs,
          res,
          filePath,
          outputFile
        );
        break;

      default:
        res.status(400).send("Unsupported file type");
    }
  });
  }catch(err){
    return res.status(400).json(err);
  }
});


app.post("/submit-code", (req, res) => {
  try{
  let {
    code,
    fileExtension,
    inputs,
    correctCode,
    correctFileExtension
  } = req.body;


  // Handle public class declarations for both codes
  if (fileExtension === ".java") {
    code = code.replace(/public\s+class\s+(\w+)/g, "class $1");
    correctCode = correctCode.replace(/public\s+class\s+(\w+)/g, "class $1");
  }
     // Function to escape \n within double-quoted strings
     const escapeNewLinesInDoubleQuotes = (text) => {
      return text.replace(/"[^"]*?\n[^"]*?"/g, (match) => match.replace(/\n/g, '\\n'));
    };
  
    // Escape \n in double-quoted strings
    code = escapeNewLinesInDoubleQuotes(code);
    correctCode = escapeNewLinesInDoubleQuotes(correctCode);

  let fileNameWithoutExt = "tempfile";
  if (fileExtension === ".java") {
    const classNameMatch = code.match(/class\s+(\w+)/);
    if (classNameMatch && classNameMatch[1]) {
      fileNameWithoutExt = classNameMatch[1];
    }
  }

  const fileName = generateUniqueFileName(fileNameWithoutExt, fileExtension);
  const filePath = path.join(__dirname, fileName);
  const outputFile = path.join(__dirname, fileNameWithoutExt);

  const correctFileName = generateUniqueFileName(fileNameWithoutExt, correctFileExtension);
  const correctFilePath = path.join(__dirname, correctFileName);
  const correctOutputFile = path.join(__dirname, fileNameWithoutExt);

  fs.writeFile(filePath, code, (err) => {
    if (err) {
      return res.status(500).send("Error writing file");
    }

    fs.writeFile(correctFilePath, correctCode, (err) => {
      if (err) {
        return res.status(500).send("Error writing correct code file");
      }

      const processCode = (compileCmd, runCmd, inputs, filePath, outputFile, callback) => {
        let results = new Array(inputs.length);
        let completed = 0;

        inputs.forEach((input, index) => {
          runCommand(compileCmd, runCmd, input, (result) => {
            results[index] = result; // Store the result
            completed++;
            if (completed === inputs.length) {
              // Ensure cleanup is done after all inputs have been processed
              setTimeout(() => {
                cleanupFiles(filePath, outputFile);
                callback(results);
              }, 100); // Small delay to ensure cleanup happens after all outputs are processed
            }
          });
        });
      };

      const compareOutputs = (userResults, correctResults) => {
        return userResults.map((userResult, index) => ({
          input: inputs[index],
          match: userResult === correctResults[index],
          userOutput: userResult,
          correctOutput: correctResults[index]
        }));
      };

      switch (fileExtension) {
        case ".java":
          const javaCompileCmd = `javac ${filePath}`;
          const javaRunCmd = `java -cp ${path.dirname(filePath)} ${fileNameWithoutExt}`;
          const javaCorrectCompileCmd = `javac ${correctFilePath}`;
          const javaCorrectRunCmd = `java -cp ${path.dirname(correctFilePath)} ${fileNameWithoutExt}`;

          processCode(javaCompileCmd, javaRunCmd, inputs, filePath, outputFile, (userResults) => {
            processCode(javaCorrectCompileCmd, javaCorrectRunCmd, inputs, correctFilePath, correctOutputFile, (correctResults) => {
              res.json(compareOutputs(userResults, correctResults));
            });
          });
          break;

        case ".py":
          const pythonRunCmd = `python ${filePath}`;
          const pythonCorrectRunCmd = `python ${correctFilePath}`;

          processCode(null, pythonRunCmd, inputs, filePath, null, (userResults) => {
            processCode(null, pythonCorrectRunCmd, inputs, correctFilePath, null, (correctResults) => {
              res.json(compareOutputs(userResults, correctResults));
            });
          });
          break;

        case ".c":
          const cCompileCmd = `gcc ${filePath} -o ${outputFile}`;
          const cRunCmd = `./${fileNameWithoutExt}`;
          const cCorrectCompileCmd = `gcc ${correctFilePath} -o ${correctOutputFile}`;
          const cCorrectRunCmd = `./${fileNameWithoutExt}`;

          processCode(cCompileCmd, cRunCmd, inputs, filePath, outputFile, (userResults) => {
            processCode(cCorrectCompileCmd, cCorrectRunCmd, inputs, correctFilePath, correctOutputFile, (correctResults) => {
              res.json(compareOutputs(userResults, correctResults));
            });
          });
          break;

        case ".cpp":
          const cppCompileCmd = `g++ ${filePath} -o ${outputFile}`;
          const cppRunCmd = `./${fileNameWithoutExt}`;
          const cppCorrectCompileCmd = `g++ ${correctFilePath} -o ${correctOutputFile}`;
          const cppCorrectRunCmd = `./${fileNameWithoutExt}`;

          processCode(cppCompileCmd, cppRunCmd, inputs, filePath, outputFile, (userResults) => {
            processCode(cppCorrectCompileCmd, cppCorrectRunCmd, inputs, correctFilePath, correctOutputFile, (correctResults) => {
              res.json(compareOutputs(userResults, correctResults));
            });
          });
          break;

        default:
          res.status(400).send("Unsupported file type");
      }
    });
  });
  }catch(err){
  return res.status(400).json(err);
}
});




app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});