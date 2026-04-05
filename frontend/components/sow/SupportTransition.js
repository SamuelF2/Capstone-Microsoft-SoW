import SectionHeader from './ui/SectionHeader';
import FormCard from './ui/FormCard';
import TwoColumnGrid from './ui/TwoColumnGrid';

export default function SupportTransition({ data, onChange }) {
  const transitionPlan = data?.transitionPlan ?? '';
  const supportModel = data?.supportModel ?? '';
  const handoverDate = data?.handoverDate ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <SectionHeader
        title="Support Transition"
        description="Define how the solution will be handed over to the customer's operations team and what ongoing support is provided."
      />

      <TwoColumnGrid style={{ marginBottom: 'var(--spacing-xl)' }}>
        <FormCard
          title="Transition Plan"
          description="Describe how the solution will be transitioned to the customer's operations team after go-live, including training, documentation, and handover activities."
        >
          <textarea
            className="form-textarea"
            value={transitionPlan}
            onChange={(e) => update({ transitionPlan: e.target.value })}
            placeholder="Outline the transition activities, timelines, training sessions, and documentation that will be provided to the customer's team..."
            rows={8}
          />
        </FormCard>

        <FormCard
          title="Ongoing Support Model"
          description="Describe the support model that will be in place after the transition, including SLAs, contact channels, and escalation paths."
        >
          <div className="form-group">
            <label className="form-label">Target Handover Date</label>
            <input
              type="date"
              className="form-input"
              value={handoverDate}
              onChange={(e) => update({ handoverDate: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Support Description</label>
            <textarea
              className="form-textarea"
              value={supportModel}
              onChange={(e) => update({ supportModel: e.target.value })}
              placeholder="Describe the post-go-live support model, response times, and how the customer can raise issues..."
              rows={5}
            />
          </div>
        </FormCard>
      </TwoColumnGrid>
    </div>
  );
}
