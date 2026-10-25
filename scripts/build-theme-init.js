export function themeBootstrap(source) {
  return `// Generated from src/custom-theme.js by prebuild. Keep first paint consistent.\n(() => {\n${source.replace(/^export /gm,'')}\ntry { const saved=JSON.parse(localStorage.getItem('kadr.preferences.v1')||'{}'); const root=document.documentElement; root.dataset.theme=['night','oled','nord','sakura','cream','custom'].includes(saved?.theme)?saved.theme:'night'; if(root.dataset.theme==='custom')applyCustom(root,saved.custom); } catch {document.documentElement.dataset.theme='night';}\n})();\n`;
}
