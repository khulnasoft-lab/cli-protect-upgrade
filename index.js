const fs = require('fs');
const { exec } = require('child_process');
const { exit } = require('process');

function exitWithMessage(message, code = 0) {
  console.log(message);
  exit(code);
}

async function detectYarnOrNpm() {
  const files = await fs.readdirSync(process.cwd());
  const isItNodeProject = files.some((f) => f === 'package.json');
  if (!isItNodeProject) {
    return;
  }

  const isItYarn = files.some((f) => f === 'yarn.lock');
  return isItYarn ? 'yarn' : 'npm';
}

async function detectKhulnasoftInDependencies() {
  const { dependencies, devDependencies } = JSON.parse(
    fs.readFileSync('package.json', 'utf8'),
  );
  if (
    (dependencies && Object.keys(dependencies).some((d) => d === 'khulnasoft')) ||
    (devDependencies && Object.keys(devDependencies).some((d) => d === 'khulnasoft'))
  ) {
    return true;
  }
  return false;
}

// TODO: is this different to child process exec?
function executeCommand(cmd) {
  console.info('Running command:', cmd);
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      const error = stderr.trim();
      if (error) {
        console.error(`inner stderr received from ${cmd}: `, error);
        console.error(error);
      }
      if (err) {
        return reject(err);
      }
      resolve(stdout.split('\n').join(''));
    });
  });
}

async function uninstallKhulnasoft(packageManager) {
  console.info('Removing khulnasoft package from dependencies.');
  if (packageManager === 'npm') {
    return await executeCommand('npm uninstall khulnasoft');
  }
  return await executeCommand('yarn remove khulnasoft');
}

async function installKhulnasoftProtect(packageManager) {
  console.info('Adding @khulnasoft/protect package to dependencies.');
  if (packageManager === 'npm') {
    return await executeCommand('npm install @khulnasoft/protect@latest');
  }
  return await executeCommand('yarn add @khulnasoft/protect@latest');
}

async function isKhulnasoftProtectNeeded(packageManager) {
  const khulnasoftProtectOutput = await executeCommand(
    `${packageManager === 'npm' ? 'npx' : 'yarn run'} khulnasoft-protect`,
  );
  if (
    khulnasoftProtectOutput.includes('No .khulnasoft file found') ||
    khulnasoftProtectOutput.includes('Nothing to patch')
  ) {
    return false;
  }
  return true;
}

async function run() {
  console.info('Checking package.json project in the current directory.');
  const packageManager = await detectYarnOrNpm();
  if (!packageManager) {
    return exitWithMessage(
      'No package.json. You need to run this command only in a folder with an npm or yarn project',
      1,
    );
  }
  const khulnasoftPackageFound = await detectKhulnasoftInDependencies();
  if (!khulnasoftPackageFound) {
    return exitWithMessage(
      'There is no `khulnasoft` package listed as a dependency. Nothing to upgrade.',
      0,
    );
  }

  await uninstallKhulnasoft(packageManager);

  console.info('Updating package.json file.');
  fs.writeFileSync(
    'package.json',
    fs
      .readFileSync('package.json', 'utf8')
      .replace('khulnasoft protect', 'khulnasoft-protect'),
  );

  await installKhulnasoftProtect(packageManager);

  if (await isKhulnasoftProtectNeeded(packageManager)) {
    return exitWithMessage(
      `All done. Review and commit the changes to package.json and ${
        packageManager === 'npm' ? 'package-lock.json' : 'yarn.lock'
      }.`,
      0,
    );
  }

  return exitWithMessage(
    `All done. But we've detected that Khulnasoft Protect is not patching anything. Review and commit the changes to package.json and ${
      packageManager === 'npm' ? 'package-lock.json' : 'yarn.lock'
    }.`,
    0,
  );
}

run();
