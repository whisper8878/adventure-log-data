# Adventure Log V5 - JSON数据库

这是Adventure Log V5游戏的云端JSON数据仓库。

## 📁 数据结构

```
scenes/                 # 游戏场景数据
├── starter/           # 启动场景
├── dungeons/          # 地牢场景
├── world/             # 世界场景
└── test/              # 测试场景

characters/            # 角色模板数据 (待添加)
items/                # 物品数据 (待添加)
spells/               # 法术数据 (待添加)
events/               # 事件数据 (待添加)
```

## 🔗 访问方式

通过GitHub Raw API访问文件：
```
https://raw.githubusercontent.com/YOUR_USERNAME/adventure-log-data/main/scenes/场景文件名.json
```

## 📋 可用场景

| 文件名 | 描述 | 类型 |
|--------|------|------|
| `default_initial_scene.json` | 经典的新手村场景 | 启动 |
| `universal_starter_scene.json` | 万能启动场景 - 多冒险类型选择 | 启动 |
| `test_compact_layout.json` | 紧凑的测试探索区域 | 测试 |
| `test_compact_layout_with_events.json` | 包含事件系统的测试区域 | 测试 |
| `large_dungeon_scene.json` | 复杂的多层地牢探索场景 | 地牢 |

## 🎮 如何使用

1. 在你的Adventure Log V5游戏中，配置数据源URL
2. 使用场景选择器加载云端场景
3. 享受动态数据加载的便利！

## 🔄 版本历史

- v1.0.0 - 初始版本，包含5个基础场景

---

*由Adventure Log V5游戏系统生成并维护*
