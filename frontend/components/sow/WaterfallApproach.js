import SectionHeader from './ui/SectionHeader';
import FormCard from './ui/FormCard';
import TwoColumnGrid from './ui/TwoColumnGrid';

export default function WaterfallApproach({ data, onChange }) {
  const deliveryApproach = data?.deliveryApproach ?? '';
  const supportTransitionPlan = data?.supportTransitionPlan ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <SectionHeader
        title="Waterfall Approach"
        description="Describe the Waterfall delivery methodology and how the project will be structured across sequential phases."
      />

      <TwoColumnGrid>
        <FormCard
          title="Delivery Approach & Methodology"
          description="Ensure your approach aligns with the Waterfall methodology and includes how you'll manage risks and quality across each phase."
        >
          <textarea
            className="form-textarea"
            value={deliveryApproach}
            onChange={(e) => update({ deliveryApproach: e.target.value })}
            placeholder="Describe the Waterfall approach — phase gates, requirements sign-off, change control process, quality checkpoints, and how risks will be managed across the sequential phases..."
            rows={10}
          />
        </FormCard>

        <FormCard
          title="Support Transition Plan"
          description="Describe how the solution will be transitioned to the customer's operations team after go-live."
        >
          <textarea
            className="form-textarea"
            value={supportTransitionPlan}
            onChange={(e) => update({ supportTransitionPlan: e.target.value })}
            placeholder="Outline the transition plan — documentation deliverables, training sessions, knowledge transfer activities, and the support model after project closure..."
            rows={10}
          />
        </FormCard>
      </TwoColumnGrid>
    </div>
  );
}
