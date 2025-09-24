import { useInterestForm } from '@/contexts/InterestFormContext'
import InterestFormDialog from '@/components/InterestFormDialog'

const AutoInterestForm = () => {
  const { showInterestForm, setShowInterestForm } = useInterestForm()

  return (
    <InterestFormDialog
      open={showInterestForm}
      onOpenChange={setShowInterestForm}
    />
  )
}

export default AutoInterestForm;
