# Quick Start

We're excited to announce the support for UI-TARS-1.5! 🎉🎉🎉

The previous version of UI-TARS Desktop version 0.0.8 will be upgraded to a new Desktop App 0.1.0 with support for both Computer and Browser use.

## Download

You can download the [latest release](https://github.com/bytedance/UI-TARS-desktop/releases/latest) version of UI-TARS Desktop from our releases page.

> **Note**: If you have [Homebrew](https://brew.sh/) installed, you can install UI-TARS Desktop by running the following command:
> ```bash
> brew install --cask ui-tars
> ```

## Install

### MacOS

1. Drag **UI TARS** application into the **Applications** folder
  <img src="../apps/ui-tars/images/mac_install.png" width="500px" />

2. Enable the permission of **UI TARS** in MacOS:
  - System Settings -> Privacy & Security -> **Accessibility**
  - System Settings -> Privacy & Security -> **Screen Recording**
  <img src="../apps/ui-tars/images/mac_permission.png" width="500px" />

3. Then open **UI TARS** application, you can see the following interface:
  <img src="../apps/ui-tars/images/mac_app.png" width="500px" />


### Windows

**Still to run** the application, you can see the following interface:

<img src="../apps/ui-tars/images/windows_install.png" width="400px" style="margin-left: 4em;" />

## Get our newest model

### UI-TARS-1.5 on [Hugging Face](https://endpoints.huggingface.co/catalog)

1. Click the button `Deploy from Hugging Face` on the top right corner of the page
  <img src="../apps/ui-tars/images/huggingface_deploy.png" width="500px" />

2. Select the model UI-TARS-1.5-7B
  <img src="../apps/ui-tars/images/huggingface_uitars_1.5.png" width="500px" />

3. Configure the model settings and select correct VLM Provider after your deployment
  <img src="../apps/ui-tars/images/huggingface_uitars_1.5_config.png" width="500px" />

> Refer to [[UI-TARS-1.5 Deployment Official Guide]](https://github.com/bytedance/UI-TARS/blob/main/README_deploy.md) for more detail about the UI-TARS-1.5's latest deployment methods.

### Doubao-1.5-UI-TARS on [VolcEngine](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-1-5-ui-tars)

1. Click the button `Try` on the top right corner of the page
  <img src="../apps/ui-tars/images/volcengine_deploy.png" width="500px" />

2. Click the `API inference` link
  <img src="../apps/ui-tars/images/volcengine_api.png" width="500px" />

  Complete identity verification to obtain the model configuration.

3. Configure the model settings and select correct VLM Provider after your deployment
  <img src="../apps/ui-tars/images/volcengine_doubao_tars.png" width="500px" />

> Refer to [UI-TARS Model Deployment Guide (Chinese)](https://bytedance.sg.larkoffice.com/docx/TCcudYwyIox5vyxiSDLlgIsTgWf) for more detail about the Doubao-1.5-UI-TARS's latest deployment methods.

## Add your model settings

1. Click the **Settings** button on the bottom left corner of the application
  <img src="../apps/ui-tars/images/setting.png" width="500px" />

> Read the [Settings Configuration Guide](./setting.md) and set up VLM/Chat parameters. Selecting the appropriate VLM Provider can optimize desktop app performance when using model.

2. Select the desired usage scenario before starting a new chat
  <img src="../apps/ui-tars/images/settings_scene.png" width="500px" />

3. Input the command to start a round of GUI operation tasks!

  <img src="../apps/ui-tars/images/start_task.png" width="500px" />