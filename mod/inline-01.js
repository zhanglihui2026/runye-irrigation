/* [v446] 默认显示在线地图：初始活动区块由 index.html 标记；无参数无锚点时同步地图锚点，显式地址保持原行为。 */if(!location.search&&!location.hash)location.replace('index.html#onlineMapSection');
