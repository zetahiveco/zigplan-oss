import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState(() => window.electron?.process.versions)

  if (!versions) {
    return <></>
  }

  return (
    <ul className="flex items-center overflow-hidden rounded-full bg-muted px-1 py-2 font-mono text-sm text-muted-foreground">
      <li className="border-r border-border px-5">Electron v{versions.electron}</li>
      <li className="border-r border-border px-5">Chromium v{versions.chrome}</li>
      <li className="px-5">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
