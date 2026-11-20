import { lazy, Suspense, useState } from 'react';
import { connect } from 'react-redux';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';

const Prime = lazy(() => import('../Prime'));
const IoniqPanel = lazy(() => import('../IoniqPanel'));
const LogsPanel = lazy(() => import('../LogsPanel'));

const Dashboard = ({ primeNav, device, dongleId }) => {
  const [activeTab, setActiveTab] = useState('drives');

  if (!device || !dongleId) {
    return <FullPageLoading />;
  }

  return (
    <div className="relative flex flex-col">
      <Suspense fallback={<FullPageLoading />}>
        { primeNav
          ? <Prime />
          : (
            <>
              <Navigation />
              <Promotions />
              <DeviceInfo />
              <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1 border-b border-white/10">
                {[
                  { id: 'drives', label: 'Fahrten' },
                  { id: 'ioniq', label: 'Ioniq & Verbrauch' },
                  { id: 'logs', label: 'Logs & System' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-white text-black'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {activeTab === 'drives' && <DriveList />}
              {activeTab === 'ioniq' && <IoniqPanel dongleId={dongleId} />}
              {activeTab === 'logs' && <LogsPanel dongleId={dongleId} />}
            </>
          )}
      </Suspense>
    </div>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  primeNav: state.primeNav,
  device: state.device,
});

export default connect(stateToProps)(Dashboard);
