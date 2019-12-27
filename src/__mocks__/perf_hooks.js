const perfHooks = jest.genMockFromModule('perf_hooks')

perfHooks.performance.now = jest.fn().mockImplementation(() => 0)

module.exports = perfHooks
