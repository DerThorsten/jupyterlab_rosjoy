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

      // check that all indices are unique
      const indicesSet = new Set<number>();
      gamepads.forEach(gamepadConfig => {
        indicesSet.add(gamepadConfig['gamepadIndex']);
      });
      if (indicesSet.size < gamepads.length) {
        console.error(
          gamepads.length,
          indicesSet.size,
          'gamepadIndex must be unique'
        );
        throw new Error('gamepadIndex must be unique');
      }

      gamepads.forEach(gamepadConfig => {
        const gamepadIndex = gamepadConfig['gamepadIndex'] - 1;
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

  asJsonable(): any {
    if (this.connected) {
      return {
        header: {
          id: this.name,
          stamp: this.timestamp
        },
        axes: this.axes,
        buttons: this.buttons
      };
    } else {
      return {};
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
    this.title.label = 'No gamepad connected';
    this.title.icon = gamepadIcon;
    this.title.closable = true;

    this.gamepadState = new GamepadState();
    this.gamepadIndex = gamepadIndex;

    if (navigator.getGamepads === void 0) {
      // Checks if the browser supports the gamepad API
      const readout = 'This browser does not support gamepads.';
      console.error(readout);
    } else {
      const readout = 'Connect gamepad and press any button.';
      console.log(readout);
      if (this.gamepadState.connected) {
        this.update_loop();
      } else {
        this.renderModel(this.asJsonMimeNodel()).then(
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
  sendJsonRpc(jsonable: any): void {
    // @ts-expect-error  this variable is unused intil
    // we actualy send a message to the ros topic
    const jsonString = JSON.stringify(jsonable);
  }
  asJsonMimeNodel(): MimeModel {
    return this.asJsonMimeNodelFromJsonable(this.gamepadState.asJsonable());
  }
  asJsonMimeNodelFromJsonable(jsonable: any): MimeModel {
    const model = new MimeModel();
    model.setData({
      data: {
        'application/json': {
          gamepad: jsonable
        }
      }
    });
    return model;
  }
  wait_loop(): void {
    console.log(this.gamepadIndex, navigator.getGamepads());
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

      this.renderModel(this.asJsonMimeNodel()).then((value: any) => {
        window.requestAnimationFrame(this.update_loop.bind(this));
      });

      window.requestAnimationFrame(this.wait_loop.bind(this));
      this.title.label = 'No gamepad connected';
    }

    if (
      pad &&
      this.gamepadIndex === pad.index &&
      this.gamepadState.name === pad.id
    ) {
      this.gamepadState.set(pad);
      const jsonable = this.gamepadState.asJsonable();
      this.sendJsonRpc(jsonable);
      this.renderModel(this.asJsonMimeNodelFromJsonable(jsonable)).then(
        (value: any) => {
          window.requestAnimationFrame(this.update_loop.bind(this));
        }
      );
    } else {
      this.gamepadState.reset();
    }
  }
}
