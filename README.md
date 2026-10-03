

---

## 🎯 这个工具能做什么？

**PvZ2-Worldmap-Editor** 是一个用 TypeScript 开发的可视化世界地图编辑器。你可以用它来修改《植物大战僵尸 2》中的世界地图布局。

编辑完成后，你可以直接导出文件，将导出json重命名为worldmap.json,编码为rton替换rsb提取目录中的对应文件后打包使用。

> ⚠️ **注意**：本工具仍处于实验阶段，部分功能尚不完善。


## 📦 第一步：获取所需文件

本工具需要上传完整的rsb解包（全解码）文件目录，具体方法自行探索，需要注意的是目前对上传目录有如下严格要求（通过推荐的工具可以很方便的得到该文件目录）：

- 具体结构见下文
- 所有解码文件和文件夹必须转换大小写而不是rsb头部中记录的全大写
- pam解码json统一放置在768下的动画文件夹

对上述要求不满的可以克隆代码随意修改

### 1. 获取解码工具

在浏览器中访问以下地址下载并安装解包工具：

```
https://github.com/twinstar6980/Twinning.git
```

> ⚠️ **注意**：该工具仓库中有详细的文档说明，遇到安装问题或使用问题优先查看文档。

### 2. 解码rsb

在安装完该工具后解码一个rsb并转换资源，具体步骤如下（以安卓国际版为例，只介绍了地图编辑器需要的提取步骤）：

- 将rsb文件拖入`Task Worker`的工作区
- 选择`91. PopCap Resource-Stream-Bundle Unpack`

| 操作                  | 选项                                                      |
|:--------------------|:--------------------------------------------------------|
| Version Number | `4`                                       |
| Extended Texture Information For PvZ-2-CN Version        | `0`      |
| Layout Mode      | `3. resource` |
| Export Resource | `Yes` |
| Export Packet | `No` |



重启`Task Worker`
- 将解包得到的rsb目录拖入`Task Worker`的工作区
- 选择`92. PopCap Resource-Stream-Bundle Resource Convert`

| 操作                  | 选项                                                      |
|:--------------------|:--------------------------------------------------------|
| Recase Resource Path | `Yes`|
| Extract RTON | `Yes`|
| Extract RTON - Enable Encryption | `No`|
| Extract PTX | `Yes`|
| Extract PTX - Format Category | `2. android`|
| Extract PTX - Extract As Atlas | `No`|
| Extract As Sprite | `Yes`|
| Extract PAM | `Yes`|
| Extract PAM - Extract As JSON | `Yes`|
| Extract PAM - Extract As Flash | `No`|
| Extract BNK | `No`|
| Extract WEM | `No`|

完成后你会看到类似以下结构：

```
.
├── resource_manifest.json
├── resource/
│   └── primefonts/
│       └── fbUsv8C5eI.ttf
└── convert/
    ├── packages/
    │   ├── worldmaplist.json
    │   └── worlds/
    │       ├── egypt/
    │       │   └── worldmap.json
    │       ├── future/
    │       │   └── worldmap.json
    │       ├── iceage/
    │       │   └── worldmap.json
    │       ├── rift1/
    │       │   └── worldmap.json
    │       ├── rift2/
    │       │   └── worldmap.json
    │       └── ...
    └── images/
        ├── {resolution}
        │   ├── initial/
        │   │   ├── worldmap/
        │   │   │   ├── common/
        │   │   │   │   ├── misssingartpiece.png
        │   │   │   │   ├── upgrade_%s.png
        │   │   │   │   └── ...
        │   │   │   ├── level_node/
        │   │   │   ├── level_node_minigame/
        │   │   │   ├── level_node_gargantuar/
        │   │   │   ├── giftbox_world_map/
        │   │   │   ├── sprout/
        │   │   │   ├── danger_node_egypt/
        │   │   │   ├── danger_level_egypt.png
        │   │   │   ├── zomboss_node_egypt/
        │   │   ├── UI/
        │   │   │   └── packets/
        │   │   │       ├── ready.png
        │   │   │       ├── dots_left.png
        │   │   │       ├── dots_bottom.png
        │   │   │       ├── dots_right.png
        │   │   │       ├── bonkchoy.png
        │   │   │       └── ...
        │   │   ├── plant/
        │   │   │   ├── bonkchoy/
        │   │   │   └── ...
        │   │   └── effects/
        │   │       └── collected_upgrade_effect/
        │   └── full/
        │       └── worldmap/
        │           ├── future/
        │           │   ├── island0.png
        │           │   ├── island1.png
        │           │   ├── island2.png
        │           │   ├── ...
        │           │   ├── anim1/
        │           │   ├── anim2/
        │           │   └── ...
        │           ├── pirate/
        │           │   ├── island0.png
        │           │   ├── ...
        │           │   ├── anim1/
        │           │   ├── anim2/
        │           │   └── ...
        │           ├── ...
        │           ├── twister/
        │           │   └── ...
        │           ├── zomboss_node_future/
        │           ├── ...
        │           └── danger_node_future/
        │           ├── ...
        │           ├── danger_level_future.png
        │           ├── ...
```




## 🌐 第二步：访问编辑器 URL


在浏览器中访问以下 URL：

```
https://temperedscarf9.github.io/PvZ2-Worldmap-Editor/
```

**操作方法**：先选择地图模式，然后再将rsb解码得到的目录上传至编辑器

- 目前只支持国际版大部分版本（1.4~1.6以及6.x~最新版本）和中文ios旧版（1.7.4附近的版本）这些版本只需用之前提到的工具解包即可直接上传编辑，其他版本有需要额外处理的文件或地图编辑器尚未适配

> 不要忘记必须先选择地图模式！！！

## 🖱️ 第三步：使用编辑器

关于如何操作地图编辑器，请读者自行探索

![preview](https://github.com/Temperedscarf9/PvZ2-Worldmap-Editor/blob/main/documents/images/preview/4_5_2_egypt.png)

[//]: # (## 🔧 常见问题)



[//]: # (## 📚 参考资源)



---

> **免责声明**：本工具仅供学习和研究用途，请勿用于商业目的或违反游戏服务条款的行为。