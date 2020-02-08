const {
    isIdentifier,
    isCallExpression,
    callExpression,
    objectExpression,
    objectProperty,
    functionDeclaration,
    objectPattern,
    returnStatement,
    identifier,
    memberExpression,
    blockStatement,
} = require("@babel/types");
const template = require("@babel/template");

function visitComponentMarker(result) {
    return {
        CallExpression(path) {
            if (isIdentifier(path.node.callee) && path.node.callee.name === '__akryl_react_component_marker__') {
                const node = path.node;
                const [reactId, wrapper, renderCall] = node.arguments;
                if (!isIdentifier(reactId) || !isIdentifier(wrapper)) return;

                let renderId, args;

                if (isCallExpression(renderCall) && isIdentifier(renderCall.callee)) {
                    renderId = renderCall.callee.name;
                    args = renderCall.arguments.filter(p => isIdentifier(p));
                } else if (isIdentifier(renderCall)) {
                    renderId = renderCall.name;
                    args = [];
                } else {
                    return;
                }

                const createElement = memberExpression(reactId, identifier('createElement'), false);

                const props = args.map((arg) => objectProperty(arg, arg));
                const propsObj = objectExpression(props);

                const componentFnId = identifier(`${renderId}$component`);
                const componentProps = args.map(arg => objectProperty(arg, arg));
                const componentFn = functionDeclaration(
                    componentFnId,
                    [objectPattern(componentProps)],
                    blockStatement([
                        returnStatement(
                            callExpression(
                                renderCall,
                                [],
                            ),
                        ),
                    ]),
                );

                const wrapperId = identifier(`${renderId}$wrapper`);
                const wrapperFn = template.statement.ast`var ${wrapperId} = ${wrapper}(${componentFnId})`;

                path.replaceWith(
                    callExpression(
                        createElement,
                        [wrapperId, propsObj],
                    ),
                );

                result.id = componentFnId;
                result.nodes = [componentFn, wrapperFn];
            }
        }
    };
}

function plugin(babel, options) {
    return {
        name: "akryl",
        visitor: {
            FunctionDeclaration(path, {opts}) {
                const result = {
                    id: null,
                    nodes: null,
                };
                path.traverse(visitComponentMarker(result));

                if (result.id && result.nodes) {
                    const nodes = [path.node, ...result.nodes];

                    if (!opts.production) {
                        const componentNameSetter = template.statement.ast`
                            Object.defineProperty(${result.id}, 'name', {
                                value: '${path.node.id.name}',
                            });
                        `;
                        nodes.push(componentNameSetter);
                    }

                    path.replaceWithMultiple(nodes);
                }
            }
        },
    };
}

module.exports = plugin;
