/**
 * GameBuilder 内联版本 - 所有组件打包在一个文件中
 * 避免外部依赖，直接在SillyTavern环境中使用
 */

// ================================
// Logger 系统
// ================================
class Logger {
  constructor(options = {}) {
    this.config = {
      level: 'info',
      maxLogs: 1000,
      enableConsole: true,
      enableStorage: true,
      storageKey: 'game_logs',
      enableTimestamp: true,
      ...options,
    };

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4,
    };

    this.logs = [];
    this.listeners = [];
  }

  log(level, message, data = null) {
    if (this.levels[level] > this.levels[this.config.level]) {
      return;
    }

    const logEntry = {
      id: this.generateId(),
      level,
      message,
      data,
      timestamp: Date.now(),
      timeString: new Date().toISOString(),
    };

    this.logs.push(logEntry);

    if (this.logs.length > this.config.maxLogs) {
      this.logs.shift();
    }

    if (this.config.enableConsole && console && console[level]) {
      const prefix = `[${logEntry.timeString}]`;
      if (data !== null && data !== undefined) {
        console[level](`${prefix} ${message}`, data);
      } else {
        console[level](`${prefix} ${message}`);
      }
    }

    this.listeners.forEach(listener => {
      try {
        listener(logEntry);
      } catch (error) {
        console.error('Error in log listener:', error);
      }
    });
  }

  error(message, data = null) {
    this.log('error', message, data);
  }
  warn(message, data = null) {
    this.log('warn', message, data);
  }
  info(message, data = null) {
    this.log('info', message, data);
  }
  debug(message, data = null) {
    this.log('debug', message, data);
  }
  trace(message, data = null) {
    this.log('trace', message, data);
  }

  addListener(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getLogs(filters = {}) {
    let filteredLogs = [...this.logs];
    if (filters.level) {
      const levelValue = this.levels[filters.level];
      filteredLogs = filteredLogs.filter(log => this.levels[log.level] <= levelValue);
    }
    if (filters.limit) {
      filteredLogs = filteredLogs.slice(-filters.limit);
    }
    return filteredLogs;
  }

  clear() {
    this.logs = [];
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// ================================
// ServiceLocator 系统
// ================================
class ServiceLocator {
  constructor() {
    this.services = new Map();
    this.instances = new Map();
    this.dependencies = new Map();
    this.logger = null;
  }

  register(name, serviceClass, options = {}) {
    const config = {
      singleton: true,
      lazy: true,
      dependencies: [],
      ...options,
    };

    this.services.set(name, {
      serviceClass,
      config,
      initialized: false,
    });

    this.dependencies.set(name, config.dependencies);
    this.log('debug', `Service registered: ${name}`);

    if (!config.lazy) {
      this.get(name);
    }

    return this;
  }

  get(name) {
    if (!this.services.has(name)) {
      throw new Error(`Service '${name}' not found`);
    }

    const serviceInfo = this.services.get(name);

    if (serviceInfo.config.singleton && this.instances.has(name)) {
      return this.instances.get(name);
    }

    const instance = this.createInstance(name, serviceInfo);

    if (serviceInfo.config.singleton) {
      this.instances.set(name, instance);
      serviceInfo.initialized = true;
    }

    return instance;
  }

  createInstance(name, serviceInfo) {
    const { serviceClass, config } = serviceInfo;
    const dependencies = this.resolveDependencies(name);

    let instance;
    if (typeof serviceClass === 'function') {
      instance = new serviceClass(dependencies);
    } else {
      instance = serviceClass;
    }

    if (typeof instance.initialize === 'function') {
      instance.initialize(dependencies);
    }

    return instance;
  }

  resolveDependencies(serviceName) {
    const deps = this.dependencies.get(serviceName) || [];
    const resolved = {};

    for (const depName of deps) {
      if (depName === serviceName) {
        throw new Error(`Circular dependency detected: ${serviceName}`);
      }
      resolved[depName] = this.get(depName);
    }

    return resolved;
  }

  has(name) {
    return this.services.has(name);
  }

  setLogger(logger) {
    this.logger = logger;
  }

  log(level, message, data = null) {
    if (this.logger && typeof this.logger.log === 'function') {
      this.logger.log(level, `[ServiceLocator] ${message}`, data);
    }
  }

  cleanup() {
    this.instances.clear();
    for (const [name, serviceInfo] of this.services.entries()) {
      serviceInfo.initialized = false;
    }
  }
}

// ================================
// EventBus 系统
// ================================
class EventBus {
  constructor() {
    this.listeners = new Map();
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    this.logger = null;
  }

  on(event, listener, options = {}) {
    const config = {
      once: false,
      priority: 0,
      ...options,
    };

    const listenerObj = {
      id: this.generateId(),
      listener,
      config,
      addedAt: Date.now(),
    };

    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const eventListeners = this.listeners.get(event);
    eventListeners.push(listenerObj);
    eventListeners.sort((a, b) => b.config.priority - a.config.priority);

    return listenerObj.id;
  }

  once(event, listener, options = {}) {
    return this.on(event, listener, { ...options, once: true });
  }

  off(event, listener = null) {
    if (!this.listeners.has(event)) {
      return false;
    }

    const eventListeners = this.listeners.get(event);
    let removed = 0;

    for (let i = eventListeners.length - 1; i >= 0; i--) {
      const listenerObj = eventListeners[i];

      if (!listener || listenerObj.listener === listener || listenerObj.id === listener) {
        eventListeners.splice(i, 1);
        removed++;
      }
    }

    if (eventListeners.length === 0) {
      this.listeners.delete(event);
    }

    return removed > 0;
  }

  async emit(event, data = null) {
    const startTime = Date.now();

    const eventRecord = {
      id: this.generateId(),
      event,
      data,
      timestamp: startTime,
      listeners: 0,
      errors: [],
    };

    try {
      if (!this.listeners.has(event)) {
        return { success: true, listenersCount: 0, errors: [] };
      }

      const eventListeners = this.listeners.get(event);
      eventRecord.listeners = eventListeners.length;

      const results = [];
      const errors = [];

      for (const listenerObj of eventListeners) {
        try {
          const eventObj = {
            data,
            timestamp: Date.now(),
            listenerId: listenerObj.id,
          };

          const result = await Promise.resolve(listenerObj.listener.call(null, eventObj));
          results.push(result);

          if (listenerObj.config.once) {
            this.off(event, listenerObj.id);
          }
        } catch (error) {
          errors.push({
            listenerId: listenerObj.id,
            error: error.message,
          });
          eventRecord.errors.push(error.message);
        }
      }

      this.addToHistory(eventRecord);

      return {
        success: errors.length === 0,
        listenersCount: eventListeners.length,
        results,
        errors,
      };
    } catch (error) {
      eventRecord.errors.push(error.message);
      this.addToHistory(eventRecord);
      throw error;
    }
  }

  addToHistory(eventRecord) {
    this.eventHistory.push(eventRecord);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  getHistory(limit = 50) {
    return this.eventHistory.slice(-limit);
  }

  setLogger(logger) {
    this.logger = logger;
  }

  generateId() {
    return Math.random().toString(36).substr(2, 8);
  }

  cleanup() {
    this.listeners.clear();
    this.eventHistory = [];
  }
}

// ================================
// GameCore 系统
// ================================
class GameCore {
  constructor() {
    this.version = '1.0.0';
    this.initialized = false;
    this.services = new Map();
    this.startTime = null;
    this.config = {
      debugMode: false,
      logLevel: 'info',
      enableDevPanel: false,
    };
  }

  async initialize(config = {}) {
    if (this.initialized) {
      throw new Error('GameCore is already initialized');
    }

    this.startTime = Date.now();
    this.config = { ...this.config, ...config };

    try {
      this.logger = new Logger({
        level: this.config.logLevel,
        enableConsole: this.config.debugMode,
      });

      this.serviceLocator = new ServiceLocator();
      this.serviceLocator.setLogger(this.logger);

      this.eventBus = new EventBus();
      this.eventBus.setLogger(this.logger);

      this.serviceLocator.register('GameCore', this, { singleton: true, lazy: false });
      this.serviceLocator.register('Logger', this.logger, { singleton: true, lazy: false });
      this.serviceLocator.register('EventBus', this.eventBus, { singleton: true, lazy: false });

      this.initialized = true;
      const initTime = Date.now() - this.startTime;

      this.logger.info(`GameCore initialized successfully in ${initTime}ms`);
      this.eventBus.emit('core:initialized', { version: this.version, initTime });

      return true;
    } catch (error) {
      this.logger.error('Failed to initialize GameCore', error);
      throw error;
    }
  }

  registerService(name, service, options = {}) {
    if (!this.initialized) {
      throw new Error('GameCore must be initialized before registering services');
    }

    this.serviceLocator.register(name, service, options);
    this.services.set(name, { service, options, registeredAt: Date.now() });

    this.logger.debug(`Service registered: ${name}`);
    this.eventBus.emit('core:service-registered', { name, options });
  }

  getService(name) {
    if (!this.initialized) {
      throw new Error('GameCore must be initialized before getting services');
    }
    return this.serviceLocator.get(name);
  }

  hasService(name) {
    return this.serviceLocator.has(name);
  }

  getStatus() {
    return {
      version: this.version,
      initialized: this.initialized,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      services: Array.from(this.services.keys()),
      config: this.config,
    };
  }

  getVersionInfo() {
    return {
      version: this.version,
      buildTime: this.startTime,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    };
  }

  cleanup() {
    try {
      if (this.serviceLocator) {
        this.serviceLocator.cleanup();
      }
      if (this.eventBus) {
        this.eventBus.cleanup();
      }
      this.services.clear();
      this.initialized = false;
      this.logger.info('GameCore cleanup completed');
    } catch (error) {
      console.error('Error during GameCore cleanup:', error);
    }
  }
}

// ================================
// MapBuilder 系统
// ================================
class MapBuilder {
  constructor() {
    this.maps = new Map();
    this.themes = new Map();
    this.logger = null;
    this.eventBus = null;
    this.initialized = false;

    this.initializeThemes();
  }

  initialize(dependencies = {}) {
    this.logger = dependencies.Logger || console;
    this.eventBus = dependencies.EventBus;
    this.initialized = true;
    this.log('info', 'MapBuilder initialized');
  }

  async execute(action, params) {
    if (!this.initialized) {
      throw new Error('MapBuilder not initialized');
    }

    this.log('debug', `Executing map action: ${action}`, params);

    switch (action) {
      case 'createMap':
        return await this.createMap(params);
      case 'createLinearPath':
        return await this.createLinearPath(params);
      case 'createGridLayout':
        return await this.createGridLayout(params);
      case 'createHubLayout':
        return await this.createHubLayout(params);
      case 'addNode':
        return await this.addNode(params);
      case 'connectNodes':
        return await this.connectNodes(params);
      default:
        throw new Error(`Unknown map action: ${action}`);
    }
  }

  async createMap(params) {
    const { id, type = 'linear', config = {} } = params;

    if (!id) {
      throw new Error('Map ID is required');
    }

    if (this.maps.has(id)) {
      throw new Error(`Map with ID '${id}' already exists`);
    }

    const mapData = {
      id,
      type,
      nodes: {},
      connections: [],
      theme: config.theme || 'default',
      metadata: {
        createdBy: 'ai',
        createdAt: Date.now(),
        storyContext: config.storyContext || '',
      },
    };

    this.maps.set(id, mapData);
    this.log('info', `Map created: ${id}`);

    if (this.eventBus) {
      this.eventBus.emit('map:created', { mapId: id, mapData });
    }

    return mapData;
  }

  async createLinearPath(params) {
    const { nodes = [], theme = 'default', mapId = this.generateId(), spacing = 100 } = params;

    if (nodes.length < 2) {
      throw new Error('Linear path requires at least 2 nodes');
    }

    const mapData = await this.createMap({
      id: mapId,
      type: 'linear',
      config: { theme, storyContext: params.storyContext },
    });

    for (let i = 0; i < nodes.length; i++) {
      const nodeId = typeof nodes[i] === 'string' ? nodes[i] : nodes[i].id;
      const nodeName = typeof nodes[i] === 'string' ? nodes[i] : nodes[i].name;
      const nodeDesc = typeof nodes[i] === 'string' ? `${nodeName}的描述` : nodes[i].description || `${nodeName}的描述`;

      await this.addNode({
        mapId,
        nodeId,
        name: nodeName,
        description: nodeDesc,
        position: { x: i * spacing, y: 0 },
        type: i === 0 ? 'start' : i === nodes.length - 1 ? 'end' : 'normal',
      });

      if (i > 0) {
        const prevNodeId = typeof nodes[i - 1] === 'string' ? nodes[i - 1] : nodes[i - 1].id;
        await this.connectNodes({
          mapId,
          from: prevNodeId,
          to: nodeId,
          direction: 'east',
        });
      }
    }

    this.log('info', `Linear path created: ${mapId}`, { nodeCount: nodes.length, theme });
    return this.maps.get(mapId);
  }

  async createGridLayout(params) {
    const {
      width = 3,
      height = 3,
      theme = 'default',
      mapId = this.generateId(),
      cellSize = 100,
      fillPattern = 'all',
    } = params;

    const mapData = await this.createMap({
      id: mapId,
      type: 'grid',
      config: { theme, storyContext: params.storyContext },
    });

    const nodesToCreate = this.generateGridPattern(width, height, fillPattern);

    for (const nodeInfo of nodesToCreate) {
      const { x, y } = nodeInfo;
      const nodeId = `node_${x}_${y}`;
      const nodeName = `区域 (${x}, ${y})`;

      await this.addNode({
        mapId,
        nodeId,
        name: nodeName,
        description: `位于坐标 (${x}, ${y}) 的区域`,
        position: { x: x * cellSize, y: y * cellSize },
        type: this.getGridNodeType(x, y, width, height),
      });
    }

    for (const nodeInfo of nodesToCreate) {
      const { x, y } = nodeInfo;
      const nodeId = `node_${x}_${y}`;

      if (x < width - 1 && nodesToCreate.some(n => n.x === x + 1 && n.y === y)) {
        await this.connectNodes({
          mapId,
          from: nodeId,
          to: `node_${x + 1}_${y}`,
          direction: 'east',
        });
      }

      if (y < height - 1 && nodesToCreate.some(n => n.x === x && n.y === y + 1)) {
        await this.connectNodes({
          mapId,
          from: nodeId,
          to: `node_${x}_${y + 1}`,
          direction: 'south',
        });
      }
    }

    this.log('info', `Grid layout created: ${mapId}`, {
      dimensions: `${width}x${height}`,
      nodeCount: nodesToCreate.length,
      theme,
    });

    return this.maps.get(mapId);
  }

  async createHubLayout(params) {
    const { centerNode = 'center', spokes = [], theme = 'default', mapId = this.generateId(), radius = 150 } = params;

    if (spokes.length === 0) {
      throw new Error('Hub layout requires at least one spoke');
    }

    const mapData = await this.createMap({
      id: mapId,
      type: 'hub',
      config: { theme, storyContext: params.storyContext },
    });

    await this.addNode({
      mapId,
      nodeId: centerNode,
      name: typeof centerNode === 'string' ? centerNode : centerNode.name,
      description:
        typeof centerNode === 'string' ? `${centerNode}的描述` : centerNode.description || `${centerNode.name}的描述`,
      position: { x: 0, y: 0 },
      type: 'hub',
    });

    const angleStep = (2 * Math.PI) / spokes.length;

    for (let i = 0; i < spokes.length; i++) {
      const spoke = spokes[i];
      const nodeId = typeof spoke === 'string' ? spoke : spoke.id;
      const nodeName = typeof spoke === 'string' ? spoke : spoke.name;
      const angle = i * angleStep;

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      await this.addNode({
        mapId,
        nodeId,
        name: nodeName,
        description: typeof spoke === 'string' ? `${nodeName}的描述` : spoke.description || `${nodeName}的描述`,
        position: { x: Math.round(x), y: Math.round(y) },
        type: 'normal',
      });

      await this.connectNodes({
        mapId,
        from: centerNode,
        to: nodeId,
        direction: this.getDirectionFromAngle(angle),
      });
    }

    this.log('info', `Hub layout created: ${mapId}`, {
      spokeCount: spokes.length,
      theme,
    });

    return this.maps.get(mapId);
  }

  async addNode(params) {
    const { mapId, nodeId, name, description, position = { x: 0, y: 0 }, type = 'normal' } = params;

    if (!this.maps.has(mapId)) {
      throw new Error(`Map '${mapId}' not found`);
    }

    const map = this.maps.get(mapId);

    if (map.nodes[nodeId]) {
      throw new Error(`Node '${nodeId}' already exists in map '${mapId}'`);
    }

    const nodeData = {
      nodeId,
      name,
      description,
      position,
      type,
      interactables: {},
      landmarks: [],
      metadata: {
        createdAt: Date.now(),
      },
    };

    map.nodes[nodeId] = nodeData;

    if (this.eventBus) {
      this.eventBus.emit('map:node-added', { mapId, nodeId, nodeData });
    }

    return nodeData;
  }

  async connectNodes(params) {
    const { mapId, from, to, direction = 'auto', bidirectional = true } = params;

    if (!this.maps.has(mapId)) {
      throw new Error(`Map '${mapId}' not found`);
    }

    const map = this.maps.get(mapId);

    if (!map.nodes[from]) {
      throw new Error(`Source node '${from}' not found in map '${mapId}'`);
    }

    if (!map.nodes[to]) {
      throw new Error(`Target node '${to}' not found in map '${mapId}'`);
    }

    const existingConnection = map.connections.find(
      conn => (conn.from === from && conn.to === to) || (bidirectional && conn.from === to && conn.to === from),
    );

    if (existingConnection) {
      return existingConnection;
    }

    const connectionData = {
      id: this.generateId(),
      from,
      to,
      direction,
      bidirectional,
      metadata: {
        createdAt: Date.now(),
      },
    };

    map.connections.push(connectionData);

    if (this.eventBus) {
      this.eventBus.emit('map:nodes-connected', { mapId, connectionData });
    }

    return connectionData;
  }

  // 辅助方法
  generateGridPattern(width, height, pattern) {
    const nodes = [];

    switch (pattern) {
      case 'all':
        for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) {
            nodes.push({ x, y });
          }
        }
        break;

      case 'border':
        for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) {
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
              nodes.push({ x, y });
            }
          }
        }
        break;

      default:
        for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) {
            nodes.push({ x, y });
          }
        }
    }

    return nodes;
  }

  getGridNodeType(x, y, width, height) {
    if (x === 0 && y === 0) return 'start';
    if (x === width - 1 && y === height - 1) return 'end';
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) return 'border';
    return 'normal';
  }

  getDirectionFromAngle(angle) {
    const degrees = ((angle * 180) / Math.PI + 360) % 360;

    if (degrees >= 315 || degrees < 45) return 'east';
    if (degrees >= 45 && degrees < 135) return 'south';
    if (degrees >= 135 && degrees < 225) return 'west';
    if (degrees >= 225 && degrees < 315) return 'north';

    return 'east';
  }

  initializeThemes() {
    this.themes.set('default', {
      name: '默认主题',
      colors: { primary: '#333', secondary: '#666' },
      style: 'neutral',
    });

    this.themes.set('forest', {
      name: '森林主题',
      colors: { primary: '#2d5016', secondary: '#4a7c59' },
      style: 'natural',
    });

    this.themes.set('dungeon', {
      name: '地牢主题',
      colors: { primary: '#1a1a1a', secondary: '#444' },
      style: 'dark',
    });

    this.themes.set('village', {
      name: '村庄主题',
      colors: { primary: '#8b4513', secondary: '#daa520' },
      style: 'warm',
    });
  }

  getMap(mapId) {
    return this.maps.get(mapId) || null;
  }

  getAllMaps() {
    return Array.from(this.maps.values());
  }

  deleteMap(mapId) {
    const deleted = this.maps.delete(mapId);

    if (deleted && this.eventBus) {
      this.eventBus.emit('map:deleted', { mapId });
    }

    return deleted;
  }

  getStatus() {
    return {
      initialized: this.initialized,
      mapCount: this.maps.size,
      themeCount: this.themes.size,
      availableActions: [
        'createMap',
        'createLinearPath',
        'createGridLayout',
        'createHubLayout',
        'addNode',
        'connectNodes',
      ],
    };
  }

  generateId() {
    return 'map_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  log(level, message, data = null) {
    if (this.logger && typeof this.logger.log === 'function') {
      this.logger.log(level, `[MapBuilder] ${message}`, data);
    } else if (console && console[level]) {
      console[level](`[MapBuilder] ${message}`, data || '');
    }
  }

  cleanup() {
    this.maps.clear();
    this.initialized = false;
  }
}

// ================================
// GameBuilder 系统
// ================================
class GameBuilder {
  constructor() {
    this.builders = new Map();
    this.commandHistory = [];
    this.storyContext = [];
    this.maxHistorySize = 100;
    this.logger = null;
    this.eventBus = null;
    this.initialized = false;
  }

  initialize(dependencies = {}) {
    this.logger = dependencies.Logger || console;
    this.eventBus = dependencies.EventBus;
    this.storageManager = dependencies.StorageManager;

    this.registerBuilders();
    this.initialized = true;
    this.log('info', 'GameBuilder initialized');
  }

  registerBuilders() {
    this.builders.set('map', null);
    this.builders.set('npc', null);
    this.builders.set('event', null);
    this.builders.set('item', null);
    this.builders.set('story', null);
  }

  registerBuilder(type, builder) {
    this.builders.set(type, builder);
    this.log('debug', `Builder registered: ${type}`);
  }

  async execute(command) {
    try {
      const validatedCommand = this.validateCommand(command);
      this.addToHistory(validatedCommand);

      const builder = this.builders.get(validatedCommand.type);
      if (!builder) {
        throw new Error(`No builder found for type: ${validatedCommand.type}`);
      }

      this.log(
        'debug',
        `Executing command: ${validatedCommand.type}.${validatedCommand.action}`,
        validatedCommand.params,
      );

      const result = await builder.execute(validatedCommand.action, validatedCommand.params);

      if (validatedCommand.storyContext) {
        this.addStoryContext(validatedCommand.storyContext, result);
      }

      if (this.eventBus) {
        this.eventBus.emit('gamebuilder:command-executed', {
          command: validatedCommand,
          result,
        });
      }

      this.log('info', `Command executed successfully: ${validatedCommand.type}.${validatedCommand.action}`);

      return {
        success: true,
        result,
        command: validatedCommand,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.log('error', `Failed to execute command: ${error.message}`, { command, error });

      return {
        success: false,
        error: error.message,
        command,
        timestamp: Date.now(),
      };
    }
  }

  async executeBatch(commands) {
    const results = [];

    this.log('info', `Executing batch of ${commands.length} commands`);

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];

      try {
        const result = await this.execute(command);
        results.push(result);

        if (!result.success && command.stopOnError) {
          this.log('warn', `Batch execution stopped at command ${i + 1} due to error`);
          break;
        }
      } catch (error) {
        this.log('error', `Batch execution failed at command ${i + 1}`, error);
        results.push({
          success: false,
          error: error.message,
          command,
          timestamp: Date.now(),
        });

        if (command.stopOnError) {
          break;
        }
      }
    }

    if (this.eventBus) {
      this.eventBus.emit('gamebuilder:batch-executed', {
        commands,
        results,
        successCount: results.filter(r => r.success).length,
        errorCount: results.filter(r => !r.success).length,
      });
    }

    return results;
  }

  validateCommand(command) {
    if (!command || typeof command !== 'object') {
      throw new Error('Command must be an object');
    }

    if (!command.type || typeof command.type !== 'string') {
      throw new Error('Command must have a valid type');
    }

    if (!command.action || typeof command.action !== 'string') {
      throw new Error('Command must have a valid action');
    }

    if (!command.params || typeof command.params !== 'object') {
      throw new Error('Command must have valid params object');
    }

    return {
      type: command.type.toLowerCase(),
      action: command.action,
      params: command.params,
      storyContext: command.storyContext || null,
      metadata: {
        id: this.generateId(),
        timestamp: Date.now(),
        source: command.source || 'ai',
        ...command.metadata,
      },
    };
  }

  addToHistory(command) {
    this.commandHistory.push({
      ...command,
      executedAt: Date.now(),
    });

    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory.shift();
    }
  }

  addStoryContext(context, result) {
    this.storyContext.push({
      id: this.generateId(),
      context,
      result,
      timestamp: Date.now(),
    });

    if (this.storyContext.length > this.maxHistorySize) {
      this.storyContext.shift();
    }
  }

  getStoryContextSummary(limit = 10) {
    const recentContext = this.storyContext.slice(-limit);
    return recentContext.map(item => item.context).join('\n');
  }

  getHistory(filters = {}) {
    let history = [...this.commandHistory];

    if (filters.type) {
      history = history.filter(cmd => cmd.type === filters.type);
    }

    if (filters.since) {
      history = history.filter(cmd => cmd.executedAt >= filters.since);
    }

    if (filters.limit) {
      history = history.slice(-filters.limit);
    }

    return history;
  }

  getStatus() {
    const builderStatus = {};
    for (const [type, builder] of this.builders.entries()) {
      builderStatus[type] = {
        available: builder !== null,
        status: builder?.getStatus ? builder.getStatus() : 'unknown',
      };
    }

    return {
      initialized: this.initialized,
      builders: builderStatus,
      commandHistory: this.commandHistory.length,
      storyContext: this.storyContext.length,
      availableTypes: Array.from(this.builders.keys()),
    };
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  log(level, message, data = null) {
    if (this.logger && typeof this.logger.log === 'function') {
      this.logger.log(level, `[GameBuilder] ${message}`, data);
    } else if (console && console[level]) {
      console[level](`[GameBuilder] ${message}`, data || '');
    }
  }

  cleanup() {
    for (const [type, builder] of this.builders.entries()) {
      if (builder && typeof builder.cleanup === 'function') {
        builder.cleanup();
      }
    }

    this.commandHistory = [];
    this.storyContext = [];
    this.initialized = false;
  }
}

// ================================
// 全局初始化和接口
// ================================
let gameInstance = null;

async function initializeGameBuilderSystem(config = {}) {
  try {
    console.log('🎮 开始初始化GameBuilder系统...');

    const defaultConfig = {
      debugMode: true,
      logLevel: 'info',
      enableDevPanel: false,
      autoSave: false,
    };

    const finalConfig = { ...defaultConfig, ...config };

    // 初始化GameCore
    const gameCore = new GameCore();
    await gameCore.initialize(finalConfig);

    // 创建并注册GameBuilder
    const gameBuilder = new GameBuilder();
    gameBuilder.initialize({
      Logger: gameCore.logger,
      EventBus: gameCore.eventBus,
    });

    gameCore.registerService('GameBuilder', gameBuilder, {
      singleton: true,
      lazy: false,
    });

    // 创建并注册MapBuilder
    const mapBuilder = new MapBuilder();
    mapBuilder.initialize({
      Logger: gameCore.logger,
      EventBus: gameCore.eventBus,
    });

    gameBuilder.registerBuilder('map', mapBuilder);
    gameCore.registerService('MapBuilder', mapBuilder, {
      singleton: true,
      lazy: false,
    });

    // 创建全局游戏实例
    gameInstance = {
      core: gameCore,
      builder: gameBuilder,
      mapBuilder: mapBuilder,
      logger: gameCore.logger,
      eventBus: gameCore.eventBus,
    };

    // 暴露到全局作用域
    window.Game = gameInstance;
    window.GameCore = gameCore;
    window.GameBuilder = gameBuilder;
    window.MapBuilder = mapBuilder;
    window.Logger = gameCore.logger;
    window.EventBus = gameCore.eventBus;

    console.log('✅ GameBuilder系统初始化完成!');

    // 触发初始化完成事件
    gameCore.eventBus.emit('game:initialized', {
      config: finalConfig,
      services: gameCore.getStatus().services,
    });

    return gameInstance;
  } catch (error) {
    console.error('❌ GameBuilder系统初始化失败:', error);
    throw error;
  }
}

// 执行命令的便捷函数
async function executeCommand(command) {
  if (!gameInstance) {
    throw new Error('GameBuilder系统未初始化');
  }
  return await gameInstance.builder.execute(command);
}

async function executeBatch(commands) {
  if (!gameInstance) {
    throw new Error('GameBuilder系统未初始化');
  }
  return await gameInstance.builder.executeBatch(commands);
}

// 创建示例地图的便捷函数
async function createExampleMap() {
  const command = {
    type: 'map',
    action: 'createLinearPath',
    params: {
      nodes: ['村庄入口', '森林小径', '神秘洞穴'],
      theme: 'forest',
      mapId: 'example_forest_path',
    },
    storyContext: '创建一条通往神秘洞穴的森林小径',
  };

  return await executeCommand(command);
}

async function createExampleGrid() {
  const command = {
    type: 'map',
    action: 'createGridLayout',
    params: {
      width: 3,
      height: 3,
      theme: 'dungeon',
      mapId: 'example_dungeon_grid',
      fillPattern: 'border',
    },
    storyContext: '创建一个3x3的地牢网格，只有边缘区域可以通行',
  };

  return await executeCommand(command);
}

async function createExampleHub() {
  const command = {
    type: 'map',
    action: 'createHubLayout',
    params: {
      centerNode: '村庄广场',
      spokes: ['北门', '南门', '东门', '西门', '市场', '酒馆'],
      theme: 'village',
      mapId: 'example_village_hub',
    },
    storyContext: '创建一个以村庄广场为中心的辐射布局',
  };

  return await executeCommand(command);
}

// 暴露主要函数到全局作用域
window.initializeGameBuilderSystem = initializeGameBuilderSystem;
window.executeCommand = executeCommand;
window.executeBatch = executeBatch;
window.createExampleMap = createExampleMap;
window.createExampleGrid = createExampleGrid;
window.createExampleHub = createExampleHub;

console.log('🎮 GameBuilder内联系统已加载完成');
console.log('📖 可用函数:');
console.log('  - initializeGameBuilderSystem() - 初始化系统');
console.log('  - executeCommand(command) - 执行单个命令');
console.log('  - executeBatch(commands) - 批量执行命令');
console.log('  - createExampleMap() - 创建示例线性地图');
console.log('  - createExampleGrid() - 创建示例网格地图');
console.log('  - createExampleHub() - 创建示例中心辐射地图');
