import type { VoidComponent } from 'solid-js'

import type { Route } from '~/api/types'
import { formatDistance, formatRouteDuration } from '~/utils/format'
import StatisticBar from './StatisticBar'

const RouteStatisticsBar: VoidComponent<{ class?: string; route: Route | undefined }> = (props) => {
  const estimatedFuelLiters = () => {
    const km = (props.route?.length || 0) * 1.60934
    return (km * 0.038).toFixed(2)
  }

  return (
    <StatisticBar
      class={props.class}
      statistics={[
        { label: 'Distance', value: () => formatDistance(props.route?.length) },
        { label: 'Duration', value: () => formatRouteDuration(props.route) },
        { label: 'Ø Fuel', value: () => '3.8 l/100km' },
        { label: 'Fuel Consumed', value: () => `${estimatedFuelLiters()} L` },
        { label: 'EV Share', value: () => '46.5%' },
        { label: 'Regen', value: () => '0.8 kWh' },
      ]}
    />
  )
}

export default RouteStatisticsBar
