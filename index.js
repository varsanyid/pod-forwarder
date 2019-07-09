#!/usr/bin/env node
const inquirer = require("inquirer");
const chalk = require("chalk");
const shell = require("shelljs");
const { spawnSync, spawn } = require('child_process');

const log = console.log;

const spawnReadableProcess = (cmd, args, spawn) => spawn(cmd, args, {
    stdio: 'pipe',
    encoding: 'utf-8'
});

const kubectl = {
    name: 'kubectl',
    findContexts: ['config' ,'view', '-o', 'jsonpath=\'{.contexts[*].name}\''],
    findPods: ['get', '--no-headers=true', 'pods', '-o', 'custom-columns=:metadata.name'],
    switchContext: (context) => ['config', 'use-context', context],
    forwardPort: (pod, local, remote) => [`port-forward`, `${pod}`, `${local}:${remote}`]
}

const initContext = async () => {
    if(!shell.which('kubectl')) {
        log(chalk.white.bgRed('This script requires kubectl to be installed.'));
        shell.exit(1);
    }
    const availableK8sContexts = spawnReadableProcess(kubectl.name, kubectl.findContexts, spawnSync);
    if (availableK8sContexts.output) {
        const trimmedContext = availableK8sContexts.output.toString().substr(2).slice(0, -2);
        const contexts = trimmedContext.split(" ");
        const answer = await inquirer.prompt([{
            type: 'list',
            name: 'context',
            message: 'Choose a k8s context',
            choices: contexts
        }]);
        const spawnSwitchContext = spawnReadableProcess(kubectl.name, kubectl.switchContext(answer.context), spawnSync);
        const formattedOutput =  spawnSwitchContext.output.toString().substr(1).slice(0, -2);
        log(chalk.white.bgBlue.bold(formattedOutput));
    }   
}

const choosePodToForward = async () => {
    const spawnFindPods = spawnReadableProcess(kubectl.name, kubectl.findPods, spawnSync);
    if (spawnFindPods.output) {
        const pods = spawnFindPods.output.toString().substr(1).slice(0, -2).split("\n");
        const answer = await inquirer.prompt([{
            type: 'list',
            name: 'pod',
            message: 'Choose a pod',
            choices: pods
        }]);
        log(chalk.white.bgBlue.bold(answer.pod));
        return answer.pod;
    }
}

const setupForwarding = async () => {
    const localPort = await inquirer.prompt([{
        type: 'input',
        name: 'local',
        message: 'Local port:',
        validate: (input) => !isNaN(parseFloat(input)) && isFinite(input)
    }]);
    const remotePort = await inquirer.prompt([{
        type: 'input',
        name: 'remote',
        message: 'Remote port:',
        validate: (input) => !isNaN(parseFloat(input)) && isFinite(input)
    }]);
    log(`${localPort.local} -> ${remotePort.remote}`);
    return {
        local: localPort.local,
        remote: remotePort.remote
    }
}

const startForwarding = async (pod, local, remote) => {
    const forwardProcess = await spawnReadableProcess(kubectl.name, kubectl.forwardPort(pod, local, remote), spawn);
    forwardProcess.stdout.on('data', (data) => {
        log(chalk.white.bgBlue.bold(data.toString()));
    });
}

process.on('SIGINT', () => {
    process.exit(0);
});

const run = async () => {
    while(true) {
        await initContext();
        const pod = await choosePodToForward();
        const forwardingData = await setupForwarding(pod);
        await startForwarding(pod, forwardingData.local, forwardingData.remote);
    }
}

run();