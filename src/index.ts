import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ICommandPalette } from '@jupyterlab/apputils';
import { LabIcon } from '@jupyterlab/ui-components';

import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ILauncher } from '@jupyterlab/launcher';

import { RenderedJSON } from '@jupyterlab/json-extension';

import { MimeModel } from '@jupyterlab/rendermime';

import iconSvgStr from '../style/icon.svg';

export const gamepadIcon = new LabIcon({
  name: 'jupyterlab-rosjoy:icon',
  svgstr: iconSvgStr
});

const BASENAME = 'jupyterlab-rosjoy';
const ID = `${BASENAME}:plugin`;
const SETTINGS_ID = ID;

/**
 * Activate the widgets example extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: ID,
  autoStart: true,
  requires: [ICommandPalette, ISettingRegistry],
  optional: [ILauncher],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    settings: ISettingRegistry,
    launcher: ILauncher | null
  ) => {
    let _settings: ISettingRegistry.ISettings;
    const { commands, shell } = app;
    const command = `${BASENAME}:open-tab`;

    let registeredCommands: any[] = [];

    const _loadSettings = () => {
      const gamepads = _settings.get('gamepads').composite as any[];

      for (const c of registeredCommands) {
        c.dispose();
      }
      registeredCommands = [];

      gamepads.forEach((gamepadConfig, gamepadIndex) => {
        const full_cmd = command + `:${gamepadIndex}`;
        const label = gamepadConfig['alias'];
        const rcmd = commands.addCommand(full_cmd, {
          label: label,
          caption: `Open ${label} Tab`,
          execute: () => {
            const widget = new RosGamepadWidget(gamepadIndex);

            shell.add(widget, 'main');
          },
          icon: gamepadIcon
        });
        registeredCommands.push(rcmd);
        const pcmd = palette.addItem({
          command: full_cmd,
          category: 'Extension Examples'
        });
        registeredCommands.push(pcmd);

        // Add a launcher item if the launcher is available.
        if (launcher) {
          const lcmd = launcher.add({
            command: full_cmd,
            rank: 10 + gamepadIndex,
            category: 'Robotics'
          });
          registeredCommands.push(lcmd);
        }
      });
    };

    settings.load(SETTINGS_ID).then(setting => {
      console.log('SETTINGS', setting);
      _settings = setting;
      _loadSettings();
      setting.changed.connect(_loadSettings);
    });
  }
};

export default extension;

class GamepadState {
  connected: boolean;
  name: string;
  timestamp: number;
  buttons: Array<number>;
  axes: Array<number>;

  constructor() {
    this.name = '';
    // this.mapping: '',
    this.connected = false;
    this.timestamp = 0;
    this.buttons = [];
    this.axes = [];
  }
  setup(pad: Gamepad): void {
    // Set up the main gamepad attributes
    this.name = pad.id;
    // this.mapping = pad.mapping;
    this.connected = pad.connected;
    this.timestamp = pad.timestamp;
    this.buttons.length = pad.buttons.length;
    this.axes.length = pad.axes.length;
  }

  set(pad: Gamepad): void {
    if (pad) {
      this.timestamp = pad.timestamp;
      for (let bi = 0; bi < this.buttons.length; bi++) {
        this.buttons[bi] = pad.buttons[bi].pressed ? 1 : 0;
        if (this.buttons[bi]) {
          console.log(`buttons ${bi}`, this.buttons[bi]);
        }
      }

      for (let ai = 0; ai < this.axes.length; ai++) {
        this.axes[ai] = pad.axes[ai];
        if (Math.abs(this.axes[ai]) >= 0.0001) {
          console.log(`axes ${ai}`, this.axes[ai]);
        }
      }
    }
  }

  reset(): void {
    this.name = '';
    this.connected = false;
    this.timestamp = 0;
    this.buttons = [];
    this.axes = [];
  }
}

class RosGamepadWidget extends RenderedJSON {
  gamepadIndex: number;
  gamepadState: GamepadState;

  constructor(gamepadIndex: number) {
    const rendererOptions = {
      mimeType: 'application/json',
      sanitizer: {
        sanitize: (dirty: string) => {
          return dirty;
        }
      },
      resolver: null,
      linkHandler: null,
      latexTypesetter: null
    };

    super(rendererOptions);
    this.addClass('jp-example-view');
    this.id = ID;
    this.title.label = 'NO CONTROLLER CONNECTED';
    this.title.icon = gamepadIcon;
    this.title.closable = true;

    this.gamepadState = new GamepadState();
    this.gamepadIndex = gamepadIndex;

    if (navigator.getGamepads === void 0) {
      // Checks if the browser supports the gamepad API
      const readout = 'This browser does not support gamepads.';
      console.error(readout);
    } else {
      // Start the wait loop, and listen to updates of the only
      // user-provided attribute, the gamepad index.
      const readout = 'Connect gamepad and press any button.';
      console.log(readout);
      if (this.gamepadState.connected) {
        this.update_loop();
      } else {
        const model = new MimeModel();
        model.setData({
          data: {
            'application/json': {
              gamepad: {}
            }
          }
        });

        this.renderModel(model).then(
          (value: any) => {
            this.wait_loop();
          },
          (reason: any) => {
            console.error(reason);
            this.wait_loop();
          }
        );
      }
    }
  }

  wait_loop(): void {
    const pad = navigator.getGamepads()[this.gamepadIndex];
    if (pad) {
      console.log('found pad');
      this.gamepadState.setup(pad);
      this.title.label = `Gamepad #${this.gamepadIndex} ${this.gamepadState.name}`;
      window.requestAnimationFrame(this.update_loop.bind(this));
    } else {
      window.requestAnimationFrame(this.wait_loop.bind(this));
    }
  }

  update_loop(): void {
    const pad = navigator.getGamepads()[this.gamepadIndex];
    if (!pad || !pad.connected) {
      this.gamepadState.reset();
      const model = new MimeModel();
      model.setData({
        data: {
          'application/json': {
            gamepad: {}
          }
        }
      });

      this.renderModel(model).then((value: any) => {
        window.requestAnimationFrame(this.update_loop.bind(this));
      });

      window.requestAnimationFrame(this.wait_loop.bind(this));
      this.title.label = 'NO CONTROLLER CONNECTED';
    }

    if (
      pad &&
      this.gamepadIndex === pad.index &&
      this.gamepadState.name === pad.id
    ) {
      this.gamepadState.set(pad);

      const model = new MimeModel();
      model.setData({
        data: {
          'application/json': {
            gamepad: {
              index: this.gamepadIndex,
              header: {
                id: this.gamepadState.name,
                stamp: this.gamepadState.timestamp
              },
              axes: this.gamepadState.axes,
              buttons: this.gamepadState.buttons
            }
          }
        }
      });

      this.renderModel(model).then((value: any) => {
        window.requestAnimationFrame(this.update_loop.bind(this));
      });
    } else {
      this.gamepadState.reset();
    }
  }
}
