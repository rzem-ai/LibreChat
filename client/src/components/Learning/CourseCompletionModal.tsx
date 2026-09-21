import { OGDialog, OGDialogTemplate } from '@librechat/client';
import { useLearningTour } from './LearningTourContext';
import RatingStars from './RatingStars';
import { useLocalize } from '~/hooks';

/** Mounted once in `Root`; pops up whenever `LearningTourProvider` reports a finished tour. */
export default function CourseCompletionModal() {
  const localize = useLocalize();
  const { completedCourseId, dismissCompletion } = useLearningTour();

  return (
    <OGDialog
      open={completedCourseId != null}
      onOpenChange={(isOpen) => !isOpen && dismissCompletion()}
    >
      <OGDialogTemplate
        title={localize('com_learning_complete_title')}
        className="max-w-[420px]"
        showCancelButton={false}
        main={
          <div className="flex flex-col items-center gap-4 text-center">
            <img src="/assets/tour-complete.png" alt="" className="size-14" />
            <p className="text-sm text-text-secondary">{localize('com_learning_complete_body')}</p>
            {completedCourseId != null && <RatingStars courseId={completedCourseId} />}
          </div>
        }
        selection={{
          // OGDialogTemplate wraps `selection` in its own OGDialogClose, which fires
          // onOpenChange(false) right after this — that's what calls dismissCompletion,
          // so this doesn't need to call it again (see TutorialPromptModal for the
          // same pattern).
          selectHandler: () => {},
          selectText: localize('com_learning_complete_done'),
        }}
      />
    </OGDialog>
  );
}
