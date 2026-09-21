import { useEffect, useState } from 'react';
import { Button, OGDialog, OGDialogTemplate, Textarea, useToastContext } from '@librechat/client';
import { MAX_TUTORIAL_FEEDBACK_COMMENT_LENGTH } from 'librechat-data-provider';
import { useLearningTour } from './LearningTourContext';
import RatingStars from './RatingStars';
import { useUpdateTutorialStateMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

/** Mounted once in `Root`; pops up whenever `LearningTourProvider` reports a finished tour. */
export default function CourseCompletionModal() {
  const localize = useLocalize();
  const { completedCourseId, dismissCompletion } = useLearningTour();
  const { showToast } = useToastContext();
  const updateTutorialState = useUpdateTutorialStateMutation();
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    setSelectedRating(null);
    setComment('');
  }, [completedCourseId]);

  const handleSubmit = () => {
    if (completedCourseId == null || selectedRating == null) {
      return;
    }

    const trimmedComment = comment.trim();
    updateTutorialState.mutate(
      {
        tutorialFeedback: {
          [completedCourseId]: {
            score: selectedRating,
            ...(trimmedComment.length > 0 ? { comment: trimmedComment } : {}),
          },
        },
      },
      {
        onSuccess: () => {
          showToast({ status: 'success', message: localize('com_learning_rate_thanks') });
          dismissCompletion();
        },
      },
    );
  };

  return (
    <OGDialog
      open={completedCourseId != null}
      onOpenChange={(isOpen) => !isOpen && dismissCompletion()}
    >
      <OGDialogTemplate
        title={localize('com_learning_complete_title')}
        className="max-w-[420px]"
        showCloseButton={true}
        showCancelButton={false}
        main={
          <div className="flex flex-col items-center gap-4 text-center">
            <img src="/assets/tour-complete.png" alt="" className="size-14" />
            <p className="text-sm text-text-secondary">{localize('com_learning_complete_body')}</p>
            <RatingStars selected={selectedRating} onSelect={setSelectedRating} />
            <div className="w-full text-left">
              <label
                htmlFor="course-feedback-comment"
                className="mb-2 block text-xs font-semibold text-text-primary"
              >
                {localize('com_learning_rate_comment_label')}
              </label>
              <Textarea
                id="course-feedback-comment"
                rows={3}
                maxLength={MAX_TUTORIAL_FEEDBACK_COMMENT_LENGTH}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={localize('com_learning_rate_comment_placeholder')}
                className="min-h-[84px] resize-none border-border-medium bg-surface-primary text-sm"
              />
              <p className="mt-2 text-right text-xs text-text-tertiary">
                {localize('com_learning_rate_comment_count', String(comment.length))}
              </p>
            </div>
          </div>
        }
        selection={
          <Button
            variant="submit"
            onClick={handleSubmit}
            disabled={selectedRating == null || updateTutorialState.isLoading}
          >
            {localize('com_learning_rate_submit')}
          </Button>
        }
      />
    </OGDialog>
  );
}
