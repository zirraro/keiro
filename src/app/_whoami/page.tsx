export default function Who(){ return <pre style={{padding:16}}>
{JSON.stringify({ cwd: process.cwd(), startedAt: new Date().toISOString() }, null, 2)}
</pre> }
