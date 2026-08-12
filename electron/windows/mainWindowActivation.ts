type MainWindowActivator = () => boolean

let activator: MainWindowActivator | undefined
let activationPending = false

function flush(): void {
  if (activator?.()) activationPending = false
}

export function requestMainWindowActivation(): void {
  activationPending = true
  flush()
}

export function registerMainWindowActivator(next: MainWindowActivator): void {
  activator = next
  if (activationPending) flush()
}

export function clearMainWindowActivator(): void {
  activator = undefined
}
