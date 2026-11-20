import numpy as np


def topk_accuracy(scores: np.ndarray, y: np.ndarray, k: int) -> float:
    top = np.argsort(-scores, axis=1)[:, :k]
    return float((top == y[:, None]).any(axis=1).mean())


def macro_f1(pred: np.ndarray, y: np.ndarray, n_classes: int) -> float:
    f1s = []
    for c in range(n_classes):
        tp = np.sum((pred == c) & (y == c))
        fp = np.sum((pred == c) & (y != c))
        fn = np.sum((pred != c) & (y == c))
        if tp + fp + fn == 0:
            continue
        f1s.append(2 * tp / (2 * tp + fp + fn))
    return float(np.mean(f1s))


def clv_errors(pred_log: np.ndarray, true_log: np.ndarray):
    """MAE and RMSE in currency units (targets are stored as log1p)."""
    p, t = np.expm1(np.clip(pred_log, 0, 20)), np.expm1(true_log)
    return float(np.abs(p - t).mean()), float(np.sqrt(((p - t) ** 2).mean()))


def summarise(scores, pred_clv_log, y_cat, y_clv_log, n_classes=14) -> dict:
    mae, rmse = clv_errors(pred_clv_log, y_clv_log)
    return {"top1": topk_accuracy(scores, y_cat, 1), "top3": topk_accuracy(scores, y_cat, 3),
            "f1": macro_f1(scores.argmax(1), y_cat, n_classes), "clv_mae": mae, "clv_rmse": rmse}
