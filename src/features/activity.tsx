import { Activity } from "lucide-react";
import type { AppData } from "../domain/game";
import { ActivityList, Header } from "../components/shared";

export function ActivityView({ data }: { data: AppData }) {
  return (
    <>
      <Header eyebrow="YOUR HISTORY" title="Activity" />
      <div className="activity-layout glass">
        <div className="activity-intro">
          <span className="hero-icon"><Activity size={20} /></span>
          <h2>A quiet record<br />of your <span>play.</span></h2>
          <p>Every addition and status change is saved locally.</p>
        </div>
        <ActivityList items={data.activities} />
      </div>
    </>
  );
}
