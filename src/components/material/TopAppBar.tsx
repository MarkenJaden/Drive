import { Show, type JSXElement, type ParentComponent, type ValidComponent } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import clsx from 'clsx'

import { isUpdateAvailable, updateDrive } from '~/pwa'
import IconButton from './IconButton'

type TopAppBarProps = {
  class?: string
  component?: ValidComponent
  leading?: JSXElement
  trailing?: JSXElement
}

const TopAppBar: ParentComponent<TopAppBarProps> = (props) => {
  return (
    <header class={clsx('inset-x-0 top-0 flex h-16 items-center gap-4 px-4 py-5 text-on-surface', props.class)}>
      {props.leading}
      <Dynamic class="grow truncate text-title-lg" component={props.component || 'h1'}>
        {props.children}
      </Dynamic>
      <Show when={isUpdateAvailable()}>
        <IconButton name="refresh" title="Update Drive" aria-label="Update Drive" onClick={() => void updateDrive()} />
      </Show>
      {props.trailing}
    </header>
  )
}

export default TopAppBar
