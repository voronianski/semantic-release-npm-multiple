const requireReload = require('require-reload');

const reload = requireReload(require);

// The @semantic-release/npm plugin maintains
// some state at the module level to decide where to
// store its .npmrc file.
// Because of this, we have to monkey around a bit with
// Node's require cache in order to create multiple copies
// of the module in order to use it with different configurations.
const registryPlugins = {};
function getChildPlugin(registryName) {
  let plugin = registryPlugins[registryName];
  if (!plugin) {
    plugin = reload('@semantic-release/npm');
    registryPlugins[registryName] = plugin;
  }

  return plugin;
}

function createCallbackWrapper(callbackName) {
  return async ({ registries, ...pluginConfig }, context) => {
    for (const [registryName, childConfig] of Object.entries(
      registries || {}
    )) {
      const callback = getChildPlugin(registryName)[callbackName];
      if (!callback) {
        return;
      }

      context.logger.log(
        `Performing ${callbackName} for registry ${registryName}`
      );

      const environmentVariablePrefix = `${registryName.toUpperCase()}_`;
      const { env } = context;
      const childEnv = { ...env };

      const registryVarName = 'NPM_CONFIG_REGISTRY';
      const registryScopeVarName = 'REGISTRY_SCOPE';

      for (const variableName of [
        'NPM_TOKEN',
        'NPM_USERNAME',
        'NPM_PASSWORD',
        'NPM_EMAIL',
        registryVarName,
      ]) {
        const overridenValue = env[environmentVariablePrefix + variableName];
        if (overridenValue) {
          childEnv[variableName] = overridenValue;
        }
      }

      console.log('---debug values start');
      console.log(childEnv[registryVarName]);
      console.log(childEnv[registryScopeVarName]);
      console.log('---debug values end');

      // check for scoped registries and use it when it is available
      const scope = env[environmentVariablePrefix + registryScopeVarName];
      if (scope) {
        const scopedRegistryVarName = `NPM_CONFIG_${scope}:REGISTRY`;
        const scopedRegistryVarValue = env[scopedRegistryVarName];
        childEnv[scopedRegistryVarName] = scopedRegistryVarValue;

        delete childEnv[registryVarName];
      }

      await callback(
        { ...childConfig, ...pluginConfig },
        { ...context, env: childEnv }
      );
    }
  };
}

const callbackNames = ['verify', 'prepare', 'publish', 'success', 'fail'];

module.exports = Object.assign(
  {},
  ...callbackNames.map(name => ({ [name]: createCallbackWrapper(name) }))
);
