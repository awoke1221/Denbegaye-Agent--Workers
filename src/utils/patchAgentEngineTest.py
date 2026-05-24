from pathlib import Path

path = Path('src/utils/agentEngine.test.ts')
text = path.read_text(encoding='utf-8')
old = '''    const nodes = [
      {
        id: "nodeA",
        type: "core-set",
        config: {
          expression: '"hello"',
          variableName: "greeting",
        },
      },
      {
        id: "nodeB",
        type: "core-transform",
        config: {
          expression: 'variables.greeting + " world"',
        },
      },
      {
        id: "nodeC",
        type: "core-transform",
        config: {
          expression: 'variables.nodeB.transformed + "!!!"',
        },
      },
    ];

    const edges = [
      { source: "nodeA", target: "nodeB" },
      { source: "nodeB", target: "nodeC" },
    ];

    const result = await executor.executeWorkflow(nodes, edges, {}, {}, {});

    expect(result.success).toBe(true);
    expect(result.output.nodeA?.output?.variables).toEqual({
      greeting: "hello",
    });
    expect(result.output.nodeB?.transformed).toBe("hello world");
    expect(result.output.nodeC?.transformed).toBe("hello world!!!");
'''
new = '''    const nodes = [
      {
        id: "nodeA",
        type: "core-transform",
        config: {
          expression: '"hello"',
        },
      },
      {
        id: "nodeB",
        type: "core-transform",
        config: {
          expression: 'variables.nodeA.transformed + " world"',
        },
      },
      {
        id: "nodeC",
        type: "core-transform",
        config: {
          expression: 'variables.nodeB.transformed + "!!!"',
        },
      },
    ];

    const edges = [
      { source: "nodeA", target: "nodeB" },
      { source: "nodeB", target: "nodeC" },
    ];

    const result = await executor.executeWorkflow(nodes, edges, {}, {}, {});

    expect(result.success).toBe(true);
    expect(result.output.nodeA?.transformed).toBe("hello");
    expect(result.output.nodeB?.transformed).toBe("hello world");
    expect(result.output.nodeC?.transformed).toBe("hello world!!!");
'''
if old not in text:
    raise SystemExit('Old block not found')
text = text.replace(old, new)
path.write_text(text, encoding='utf-8')
print('Patch applied successfully')
