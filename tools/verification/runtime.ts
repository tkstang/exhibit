if (process.versions.node.split('.')[0] !== '24') {
  process.stderr.write(
    'Repository validation requires Node 24. Run nvm use before checking this checkout.\n',
  );
  process.exitCode = 1;
}
