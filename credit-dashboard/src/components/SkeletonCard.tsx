/**
 * SkeletonCard — animated shimmer placeholder for KPI cards
 * SkeletonRow  — animated shimmer placeholder for table rows
 */

export function SkeletonCard() {
    return (
        <div className="bg-card border border-border rounded-2xl p-5 shadow-card overflow-hidden">
            <div className="flex items-start justify-between mb-4">
                {/* Icon box skeleton */}
                <div className="w-10 h-10 rounded-xl animate-shimmer" />
                {/* Badge skeleton */}
                <div className="w-16 h-6 rounded-full animate-shimmer" />
            </div>
            {/* Label skeleton */}
            <div className="w-28 h-3.5 rounded-full animate-shimmer mb-2" />
            {/* Value skeleton */}
            <div className="w-36 h-7 rounded-lg animate-shimmer" />
        </div>
    );
}

export function SkeletonRow() {
    return (
        <tr>
            {/* Status pill */}
            <td className="px-5 py-4">
                <div className="w-20 h-6 rounded-full animate-shimmer" />
            </td>
            {/* Client */}
            <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full animate-shimmer flex-shrink-0" />
                    <div className="space-y-1.5">
                        <div className="w-36 h-3.5 rounded animate-shimmer" />
                        <div className="w-24 h-3 rounded animate-shimmer" />
                    </div>
                </div>
            </td>
            {/* Note */}
            <td className="px-5 py-4 hidden md:table-cell">
                <div className="w-16 h-3.5 rounded animate-shimmer" />
            </td>
            {/* Debt */}
            <td className="px-5 py-4">
                <div className="w-20 h-4 rounded animate-shimmer ml-auto" />
            </td>
            {/* Due date */}
            <td className="px-5 py-4 hidden lg:table-cell">
                <div className="w-24 h-3.5 rounded animate-shimmer" />
            </td>
            {/* Actions */}
            <td className="px-5 py-4">
                <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-7 rounded-lg animate-shimmer" />
                    <div className="w-8 h-8 rounded-lg animate-shimmer" />
                </div>
            </td>
        </tr>
    );
}

/** Skeleton Dashboard — full placeholder for the dashboard view */
export function SkeletonDashboard() {
    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="space-y-2">
                <div className="w-24 h-3 rounded animate-shimmer" />
                <div className="w-52 h-8 rounded-lg animate-shimmer" />
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
            </div>

            {/* Chart area */}
            <div className="grid gap-6 lg:grid-cols-7">
                <div className="bg-card border border-border rounded-2xl p-6 col-span-full lg:col-span-4 h-[360px] animate-shimmer" />
                <div className="bg-card border border-border rounded-2xl p-6 col-span-full lg:col-span-3 h-[360px] animate-shimmer" />
            </div>
        </div>
    );
}
