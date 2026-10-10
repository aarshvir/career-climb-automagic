import fs from 'node:fs';
import postcss from 'postcss';
const file='src/index.css';
const root=postcss.parse(fs.readFileSync(file,'utf8'));
const classes=new Map();
root.walkRules(rule=>{if(/^\.[a-zA-Z][\w-]*$/.test(rule.selector))classes.set(rule.selector.slice(1),rule);});
// Tailwind 4 no longer expands ordinary component classes in @apply.
// Inline only locally defined component declarations; leave framework utilities intact.
function expand(rule,stack=[]){
  for(const node of [...(rule.nodes??[])]){
    if(node.type!=='atrule'||node.name!=='apply')continue;
    const remaining=[];
    for(const token of node.params.split(/\s+/)){
      const local=classes.get(token);
      if(!local){remaining.push(token);continue;}
      if(stack.includes(token))throw new Error('Cyclic CSS component composition: '+token);
      const clone=local.clone();expand(clone,[...stack,token]);
      for(const child of clone.nodes??[])if(child.type==='decl'||child.type==='atrule')node.parent.insertBefore(node,child.clone());
    }
    if(remaining.length)node.params=remaining.join(' ');else node.remove();
  }
}
root.walkRules(rule=>expand(rule));
fs.writeFileSync(file,root.toString());
